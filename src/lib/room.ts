import { create } from 'zustand'
import type { JsonValue, Room } from 'trystero'
import { layoutById } from './layouts'
import type { Photo } from './render'
import { idbDel, idbGet, idbPut, packPhotos, unpackPhotos, type StoredPhoto } from './stash'
import { useBooth, type Design } from '../store'

/**
 * "Foto bareng lewat link": ruang live antar-HP tanpa server kami.
 *
 * Pembuat ruang (tuan rumah) membagikan link `/app/bareng#<kode>`. Teman yang membuka link tersambung langsung
 * ke browser tuan rumah lewat WebRTC (Trystero); perkenalannya lewat relay Nostr publik, fotonya tidak.
 * Tuan rumah memegang keadaan ruang: siapa saja yang ikut, frame mana punya siapa, dan foto tiap frame.
 * Foto tamu dikirim ke tuan rumah lalu diteruskan ke tamu lain, jadi tamu cukup tersambung ke tuan rumah.
 * Kalau koneksi langsung gagal (sebagian jaringan seluler), berkas patungan .txt tetap jadi cadangan.
 *
 * Tahan refresh: tiap orang punya kunci anggota tetap (bukan ID WebRTC yang berganti tiap halaman dimuat),
 * dan ruang + fotonya disimpan di browser ini saja (sessionStorage + IndexedDB, tidak ke server).
 * Halaman yang ke-refresh menyambung lagi sendiri; tuan rumah yang ke-refresh membuka ruang yang sama,
 * dan tamu yang masih terbuka tersambung lagi otomatis.
 */

const APP_ID = 'inwebbooth-bareng-v1'
const NAME_KEY = 'inwebbooth-name'
/** Kunci anggota di browser ini: membuka link yang sama lagi tetap dianggap orang yang sama. */
const MEMBER_KEY = 'inwebbooth-member'
/** Ruang yang sedang dibuka tab ini (hilang kalau tab ditutup, bertahan saat refresh). */
const SESSION_KEY = 'inwebbooth-room'
const STASH_KEY = 'room'
const STASH_MAX_AGE = 3 * 60 * 60_000
const SEND_SIDE = 1200
/** Batas menunggu tuan rumah sebelum menampilkan bantuan (koneksi tetap dicoba di belakang). */
const CONNECT_HELP_MS = 20_000

export interface Member {
  id: string
  name: string
  /** Indeks warna orang ini (lihat MEMBER_COLORS). */
  tone: number
  online: boolean
}

/** Warna penanda orang di frame. Bukan warna design system: hanya pembeda pemilik frame. */
export const MEMBER_COLORS = ['#0b5fff', '#e0457b', '#1b9e6b', '#e8890c', '#7b4ce0', '#0e9bb5', '#c2410c', '#4d7c0f', '#be185d', '#475569']
export const memberColor = (m: Pick<Member, 'tone'> | undefined) => MEMBER_COLORS[(m?.tone ?? 0) % MEMBER_COLORS.length]

export type RoomStatus =
  /** Tamu: sedang mencari tuan rumah. */
  | 'connecting'
  /** Tamu: sudah lama belum tersambung (bantuan ditampilkan, tetap mencoba). */
  | 'slow'
  | 'ready'
  /** Tamu: tuan rumah terputus (menunggu dia kembali). Foto yang sudah ada tetap bisa dihias & diunduh. */
  | 'host-left'

interface RoomState {
  code: string | null
  role: 'host' | 'guest' | null
  status: RoomStatus
  /** Kunci anggota sendiri (lihat MEMBER_KEY). ID anggota, pemilik frame, dan hostId memakai kunci ini. */
  selfId: string
  hostId: string | null
  hostName: string
  members: Member[]
  /** Pemilik tiap frame (id anggota), termasuk frame yang sudah dipesan tapi belum difoto. */
  owners: (string | null)[]
  /** Kemajuan foto yang sedang dikirim/diterima per frame (0–1). */
  transfer: Record<number, number>
  inviteOpen: boolean
  setInviteOpen: (open: boolean) => void
}

export const useRoom = create<RoomState>()((set) => ({
  code: null,
  role: null,
  status: 'connecting',
  selfId: '',
  hostId: null,
  hostName: '',
  members: [],
  owners: [],
  transfer: {},
  inviteOpen: false,
  setInviteOpen: (inviteOpen) => set({ inviteOpen }),
}))

export const inRoom = (s: Pick<RoomState, 'code'> = useRoom.getState()) => s.code !== null

export const savedName = () => {
  try {
    return localStorage.getItem(NAME_KEY) ?? ''
  } catch {
    return ''
  }
}
export const saveName = (name: string) => {
  try {
    localStorage.setItem(NAME_KEY, name.trim().slice(0, 24))
  } catch {
    /* mode privat */
  }
}

/** Nama tampilan: nama yang diisi, atau "Teman 2", "Teman 3", … */
export function displayName(m: Member | undefined, selfId?: string) {
  if (!m) return 'Teman'
  if (m.id === selfId) return 'Kamu'
  return m.name || (m.tone === 0 ? 'Tuan rumah' : `Teman ${m.tone + 1}`)
}

export const roomLink = (code: string) => `${location.origin}/app/bareng#${code}`

function newCode() {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(10))
  return [...bytes].map((b) => abc[b % abc.length]).join('')
}

// ------------------------------------------------------------------ pesan antar-HP

interface WireMember extends Omit<Member, 'online'> {
  online: boolean
}
interface RoomSnapshot {
  members: WireMember[]
  /** Layout ruang: tuan rumah bisa menggantinya kapan saja supaya semua orang kebagian frame. */
  layout?: RoomLayout
  owners: (string | null)[]
  /** ID foto tiap frame; tamu membandingkannya dengan fotonya sendiri. */
  ids: (string | null)[]
}
interface RoomLayout {
  layoutId: string
  photoMode: Design['photoMode']
}
interface Welcome extends RoomSnapshot {
  design: Design
  hostName: string
  hostKey: string
}
interface PhotoMeta {
  slot: number
  id: string
  /** Ukuran byte gambar utama lalu tiap frame live, berurutan di dalam buffer. */
  sizes: number[]
}

type Hello = {
  name: string
  key: string
}

interface Wire {
  room: Room
  hello: (data: Hello, to: string) => void
  rename: (name: string) => void
  welcome: (data: Welcome, to: string) => void
  state: (data: RoomSnapshot) => void
  claim: (slots: number[]) => Promise<number[]>
  release: (slot: number) => void
  photo: (buf: ArrayBuffer, meta: PhotoMeta, to?: string | string[]) => Promise<void>
}

let wire: Wire | null = null
/** ID foto per frame menurut ruang. */
let ids: (string | null)[] = []
/** Foto yang diterima sebelum keadaan ruang menyebutnya (urutan pesan bisa tertukar). */
const received = new Map<string, Photo>()
/** Buffer foto yang sudah dikodekan, untuk dikirim ke tamu yang baru masuk. */
const encoded = new Map<string, { buf: ArrayBuffer; meta: PhotoMeta }>()
/** Tamu: foto sendiri yang sedang dikirim (frame → id), supaya keadaan lama tidak menghapusnya. */
const pendingOut = new Map<number, string>()
let applying = false
let helpTimer: ReturnType<typeof setTimeout> | undefined
let welcomed = false
/** Tamu: ID WebRTC tuan rumah saat ini (berganti kalau tuan rumah refresh). */
let hostPeer: string | null = null
/** Tuan rumah: ID WebRTC ↔ kunci anggota. */
const peerKey = new Map<string, string>()
const keyPeer = new Map<string, string>()
/** Tuan rumah: pemilik tiap foto (ID foto → kunci anggota). */
const photoOwner = new Map<string, string>()

const patch = (p: Partial<RoomState>) => useRoom.setState(p)

/** Ubah foto di store tanpa dianggap perubahan lokal. */
function applyPhoto(slot: number, photo: Photo | null) {
  applying = true
  try {
    useBooth.getState().setPhoto(slot, photo)
  } finally {
    applying = false
  }
}

const toBlob = (c: HTMLCanvasElement, q: number) =>
  new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/jpeg', q))

function shrink(src: HTMLCanvasElement, maxSide: number) {
  const k = Math.min(1, maxSide / Math.max(src.width, src.height))
  if (k === 1) return src
  const c = document.createElement('canvas')
  c.width = Math.round(src.width * k)
  c.height = Math.round(src.height * k)
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, 0, 0, c.width, c.height)
  return c
}

async function encodePhoto(slot: number, p: Photo) {
  const parts = [await toBlob(shrink(p.img, SEND_SIDE), 0.88), ...(await Promise.all((p.burst ?? []).map((f) => toBlob(f, 0.75))))]
  const buf = await new Blob(parts).arrayBuffer()
  const meta: PhotoMeta = { slot, id: p.id, sizes: parts.map((b) => b.size) }
  return { buf, meta }
}

async function blobToCanvas(b: Blob) {
  const bmp = await createImageBitmap(b)
  const c = document.createElement('canvas')
  c.width = bmp.width
  c.height = bmp.height
  c.getContext('2d')!.drawImage(bmp, 0, 0)
  bmp.close()
  return c
}

async function decodePhoto(buf: ArrayBuffer, meta: PhotoMeta): Promise<Photo> {
  let at = 0
  const blobs = meta.sizes.map((n) => {
    const b = new Blob([buf.slice(at, at + n)], { type: 'image/jpeg' })
    at += n
    return b
  })
  const [img, ...burst] = await Promise.all(blobs.map(blobToCanvas))
  return { id: meta.id, img, burst: burst.length ? burst : undefined, source: 'friend' }
}

function setTransfer(slot: number, v: number | null) {
  const t = { ...useRoom.getState().transfer }
  if (v === null || v >= 1) delete t[slot]
  else t[slot] = v
  patch({ transfer: t })
}

// ------------------------------------------------------------------ tuan rumah

function snapshot(): RoomSnapshot {
  const s = useRoom.getState()
  const { layoutId, photoMode } = useBooth.getState().design
  return { members: s.members, layout: { layoutId, photoMode }, owners: s.owners, ids }
}

function hostBroadcast() {
  wire?.state(snapshot())
}

async function hostSendPhoto(slot: number, p: Photo, except?: string) {
  const w = wire
  if (!w) return
  let e = encoded.get(p.id)
  if (!e) {
    e = await encodePhoto(slot, p)
    encoded.set(p.id, e)
  }
  const peers = Object.keys(w.room.getPeers()).filter((id) => id !== except)
  if (peers.length) await w.photo(e.buf, { ...e.meta, slot }, peers)
}

function hostOnHello(peerId: string, name: string, key: string) {
  const s = useRoom.getState()
  if (!key || key === s.selfId) return
  // Tanpa batas orang: kalau frame-nya kurang, tuan rumah tinggal ganti layout.
  const known = s.members.find((m) => m.id === key)
  // Orang yang sama bisa kembali dengan ID WebRTC baru (refresh): frame dan warnanya tetap miliknya.
  peerKey.set(peerId, key)
  keyPeer.set(key, peerId)
  const used = new Set(s.members.map((m) => m.tone))
  const tone = known?.tone ?? [...Array(s.members.length + 1).keys()].find((t) => !used.has(t))!
  const member: Member = { id: key, name: name.trim().slice(0, 24) || (known?.name ?? ''), tone, online: true }
  const members = known ? s.members.map((m) => (m.id === key ? member : m)) : [...s.members, member]
  patch({ members })
  const self = s.members.find((m) => m.id === s.selfId)
  wire?.welcome({ ...snapshot(), design: useBooth.getState().design, hostName: self?.name ?? '', hostKey: s.selfId }, peerId)
  hostBroadcast()
  // Foto yang sudah ada dikirim ke tamu baru, frame berurutan.
  const photos = useBooth.getState().photos
  void (async () => {
    for (let i = 0; i < photos.length; i++) {
      const p = photos[i]
      if (!p || !wire) continue
      let e = encoded.get(p.id)
      if (!e) encoded.set(p.id, (e = await encodePhoto(i, p)))
      await wire.photo(e.buf, { ...e.meta, slot: i }, peerId).catch(() => null)
    }
  })()
}

function hostOnLeave(peerId: string) {
  const key = peerKey.get(peerId)
  peerKey.delete(peerId)
  // Sambungan lama orang yang sudah masuk lagi (refresh) baru terdeteksi putus: abaikan.
  if (!key || keyPeer.get(key) !== peerId) return
  keyPeer.delete(key)
  const s = useRoom.getState()
  // Frame yang dipesan tapi belum difoto dilepas; foto yang sudah masuk tetap.
  const owners = s.owners.map((o, i) => (o === key && !ids[i] ? null : o))
  patch({ members: s.members.map((m) => (m.id === key ? { ...m, online: false } : m)), owners })
  hostBroadcast()
}

function hostClaim(slots: number[], by: string) {
  const s = useRoom.getState()
  const owners = s.owners.slice()
  const granted = slots.filter((i) => i >= 0 && i < owners.length && (owners[i] === null || owners[i] === by))
  granted.forEach((i) => (owners[i] = by))
  if (granted.length) {
    patch({ owners })
    hostBroadcast()
  }
  return granted
}

async function hostOnPhoto(buf: ArrayBuffer, meta: PhotoMeta, key: string, peerId: string) {
  const s = useRoom.getState()
  if (meta.slot < 0 || meta.slot >= s.owners.length || (s.owners[meta.slot] !== null && s.owners[meta.slot] !== key)) return
  const photo = await decodePhoto(buf, meta)
  encoded.set(meta.id, { buf, meta })
  ids[meta.slot] = meta.id
  photoOwner.set(meta.id, key)
  const owners = useRoom.getState().owners.slice()
  owners[meta.slot] = key
  patch({ owners })
  applyPhoto(meta.slot, photo)
  hostBroadcast()
  if (wire) {
    const others = Object.keys(wire.room.getPeers()).filter((id) => id !== peerId)
    if (others.length) await wire.photo(buf, meta, others).catch(() => null)
  }
}

function hostOnRelease(slot: number, key: string) {
  const s = useRoom.getState()
  if (s.owners[slot] !== key) return
  const owners = s.owners.slice()
  owners[slot] = null
  ids[slot] = null
  patch({ owners })
  applyPhoto(slot, null)
  hostBroadcast()
}

/** Tuan rumah memotret/mengosongkan frame sendiri. */
function hostOnLocal(slot: number, p: Photo | null) {
  const s = useRoom.getState()
  const owners = s.owners.slice()
  owners[slot] = p ? s.selfId : null
  ids[slot] = p?.id ?? null
  if (p) photoOwner.set(p.id, s.selfId)
  patch({ owners })
  hostBroadcast()
  if (p) void hostSendPhoto(slot, p)
}

/**
 * Tuan rumah mengganti layout: jumlah frame berubah dan foto yang tidak muat pindah ke cadangan (lihat store).
 * Pemilik ikut fotonya; frame yang baru dipesan tapi belum difoto dilepas. Foto yang pindah frame dikirim ulang
 * supaya tamu yang belum pernah menerimanya (masuk setelah foto itu jadi cadangan) tetap kebagian.
 */
function hostOnLayout(prevIds: (string | null)[]) {
  const photos = useBooth.getState().photos
  ids = photos.map((p) => p?.id ?? null)
  const { selfId: self, owners: prev } = useRoom.getState()
  // Frame kosong yang sudah dipesan tetap dipesan kalau frame-nya masih ada.
  patch({ owners: photos.map((p, i) => (p ? (photoOwner.get(p.id) ?? self) : prevIds[i] ? null : (prev[i] ?? null))), transfer: {} })
  hostBroadcast()
  photos.forEach((p, i) => {
    if (p && prevIds[i] !== p.id) void hostSendPhoto(i, p).catch(() => null)
  })
}

// ------------------------------------------------------------------ tamu

/** Tamu mengikuti layout tuan rumah (tanpa dianggap perubahan lokal). */
function guestLayout(l: RoomLayout | undefined) {
  const d = useBooth.getState().design
  if (!l || (l.layoutId === d.layoutId && l.photoMode === d.photoMode)) return
  applying = true
  try {
    useBooth
      .getState()
      .setDesign(
        l.layoutId === d.layoutId
          ? { photoMode: l.photoMode }
          : { layoutId: l.layoutId, photoMode: l.photoMode, aspect: layoutById(l.layoutId).defaultAspect, overlays: [] },
      )
  } finally {
    applying = false
  }
}

/** Foto dengan ID ini yang sudah ada di HP ini: kiriman ruang, atau milik sendiri (termasuk yang di cadangan). */
function findPhoto(id: string) {
  const b = useBooth.getState()
  return received.get(id) ?? [...b.photos, ...b.sparePhotos].find((p) => p?.id === id) ?? null
}

function guestApply(snap: RoomSnapshot) {
  const self = useRoom.getState().selfId
  guestLayout(snap.layout)
  ids = snap.ids.slice()
  patch({ members: snap.members, owners: snap.owners })
  const photos = useBooth.getState().photos
  snap.ids.forEach((id, i) => {
    const mine = pendingOut.get(i)
    if (mine) {
      if (id === mine || snap.owners[i] !== self) pendingOut.delete(i)
      else return
    }
    const cur = photos[i]?.id ?? null
    if (cur === id) return
    // Foto yang belum sampai dikosongkan dulu; guestOnPhoto mengisinya begitu tiba.
    const next = id === null ? null : findPhoto(id)
    if ((next?.id ?? null) !== cur) applyPhoto(i, next)
  })
}

async function guestOnPhoto(buf: ArrayBuffer, meta: PhotoMeta) {
  const photo = await decodePhoto(buf, meta)
  received.set(meta.id, photo)
  if (ids[meta.slot] === meta.id && useBooth.getState().photos[meta.slot]?.id !== meta.id) applyPhoto(meta.slot, photo)
}

async function guestOnLocal(slot: number, p: Photo | null) {
  const w = wire
  const host = hostPeer
  if (!w || !host) return
  if (!p) {
    pendingOut.delete(slot)
    ids[slot] = null
    return w.release(slot)
  }
  pendingOut.set(slot, p.id)
  const { buf, meta } = await encodePhoto(slot, p)
  setTransfer(slot, 0)
  await w.photo(buf, meta, host).catch(() => null)
  setTransfer(slot, null)
}

// ------------------------------------------------------------------ sambungan

/** Perubahan foto oleh pengguna sendiri (kamera, upload, kosongkan) diteruskan ke ruang. */
function watchLocal() {
  unwatch()
  unwatchers.push(
    useBooth.subscribe((next, prev) => {
      if (next.photos !== prev.photos || next.design !== prev.design) saveSoon()
      if (applying || !wire) return
      const { role, status } = useRoom.getState()
      const relayout = next.design.layoutId !== prev.design.layoutId || next.design.photoMode !== prev.design.photoMode
      if (role === 'host' && relayout) return hostOnLayout(prev.photos.map((p) => p?.id ?? null))
      if (next.photos === prev.photos || status === 'host-left') return
      next.photos.forEach((p, i) => {
        if ((p?.id ?? null) === (prev.photos[i]?.id ?? null)) return
        if (role === 'host') hostOnLocal(i, p)
        else void guestOnLocal(i, p)
      })
    }),
    useRoom.subscribe((next, prev) => {
      if (next.members !== prev.members || next.owners !== prev.owners) saveSoon()
    }),
  )
}

/** Tamu yang tersambung lagi: foto miliknya yang belum dimiliki tuan rumah (diambil saat terputus) dikirim ulang. */
function guestPushMissing(snap: RoomSnapshot) {
  const self = useRoom.getState().selfId
  return useBooth
    .getState()
    .photos.map((p, i) => ({ p, i }))
    .filter(({ p, i }) => p && p.source !== 'friend' && snap.ids[i] !== p.id && (snap.owners[i] === null || snap.owners[i] === self)) as {
    p: Photo
    i: number
  }[]
}

async function connect(code: string, role: 'host' | 'guest', name: string) {
  const attempt = ++connects
  const { joinRoom } = await import('trystero')
  // Ruang sudah ditinggalkan, atau ada sambungan yang lebih baru, selama trystero dimuat.
  if (attempt !== connects || useRoom.getState().code !== code) return
  const room = joinRoom({ appId: APP_ID, password: code }, code)
  const key = useRoom.getState().selfId

  const hello = room.makeAction<Hello>('hello')
  const rename = room.makeAction<string>('rename')
  const welcome = room.makeAction<JsonValue>('welcome')
  const state = room.makeAction<JsonValue>('state')
  const claim = room.makeAction<number[], number[]>('claim', { kind: 'request' })
  const release = room.makeAction<number>('release')
  const photo = room.makeAction<ArrayBuffer>('photo')

  hostPeer = null
  peerKey.clear()
  keyPeer.clear()
  wire = {
    room,
    hello: (data, to) => void hello.send(data, { target: to }),
    rename: (n) => {
      if (hostPeer) void rename.send(n, { target: hostPeer })
    },
    welcome: (data, to) => void welcome.send(data as unknown as JsonValue, { target: to }),
    state: (data) => void state.send(data as unknown as JsonValue),
    claim: (slots) => {
      if (!hostPeer) return Promise.resolve([])
      return claim.request(slots, { target: hostPeer, timeoutMs: 8000 }).catch(() => [])
    },
    release: (slot) => {
      if (hostPeer) void release.send(slot, { target: hostPeer })
    },
    photo: (buf, meta, to) => photo.send(buf, { target: to ?? null, metadata: meta as unknown as JsonValue }),
  }

  const onProgress = (p: number, { metadata }: { metadata?: JsonValue }) => {
    const slot = (metadata as unknown as PhotoMeta | undefined)?.slot
    if (typeof slot === 'number') setTransfer(slot, p)
  }

  if (role === 'host') {
    // Tamu versi lama (tanpa kunci) memakai ID WebRTC-nya sebagai kunci.
    hello.onMessage = (d, { peerId }) => hostOnHello(peerId, d?.name ?? '', d?.key || peerId)
    rename.onMessage = (n, { peerId }) => {
      const k = peerKey.get(peerId)
      if (!k) return
      const s = useRoom.getState()
      patch({ members: s.members.map((m) => (m.id === k ? { ...m, name: String(n).trim().slice(0, 24) } : m)) })
      hostBroadcast()
    }
    claim.onRequest = (slots, { peerId }) => {
      const k = peerKey.get(peerId)
      return k ? hostClaim(Array.isArray(slots) ? slots : [], k) : []
    }
    release.onMessage = (slot, { peerId }) => {
      const k = peerKey.get(peerId)
      if (k) hostOnRelease(Number(slot), k)
    }
    photo.onMessage = (buf, { peerId, metadata }) => {
      const k = peerKey.get(peerId)
      if (k) void hostOnPhoto(buf, metadata as unknown as PhotoMeta, k, peerId)
    }
    photo.onReceiveProgress = onProgress
    room.onPeerLeave = hostOnLeave
  } else {
    // Dikirim ke semua yang masuk, termasuk tuan rumah yang kembali setelah refresh.
    room.onPeerJoin = (peerId) => wire?.hello({ name: savedName() || name, key }, peerId)
    welcome.onMessage = (d, { peerId }) => {
      const w = d as unknown as Welcome
      clearTimeout(helpTimer)
      let push: { p: Photo; i: number }[] = []
      if (!welcomed) {
        welcomed = true
        applying = true
        try {
          useBooth.getState().loadPatungan(w.design, [], w.hostName || null)
        } finally {
          applying = false
        }
      } else push = guestPushMissing(w)
      hostPeer = peerId
      patch({ hostId: w.hostKey ?? peerId, hostName: w.hostName, status: 'ready' })
      guestApply(w)
      for (const { p, i } of push) {
        applyPhoto(i, p)
        void guestOnLocal(i, p)
      }
    }
    state.onMessage = (d, { peerId }) => {
      if (peerId === hostPeer) guestApply(d as unknown as RoomSnapshot)
    }
    photo.onMessage = (buf, { peerId, metadata }) => {
      if (peerId === hostPeer) void guestOnPhoto(buf, metadata as unknown as PhotoMeta)
    }
    photo.onReceiveProgress = onProgress
    room.onPeerLeave = (peerId) => {
      if (peerId !== hostPeer) return
      hostPeer = null
      // Lanjut sendiri sambil menunggu tuan rumah kembali: frame yang dipesan orang lain tapi belum difoto jadi bebas.
      const photos = useBooth.getState().photos
      patch({ status: 'host-left', owners: useRoom.getState().owners.map((o, i) => (photos[i] ? o : null)) })
    }
    helpTimer = setTimeout(() => {
      if (useRoom.getState().status === 'connecting') patch({ status: 'slow' })
    }, CONNECT_HELP_MS)
  }

  watchLocal()
  saveSoon()
  keepAwake()
}

/** Buat ruang baru dari sesi sekarang; foto yang sudah ada jadi milik tuan rumah. */
export async function createRoom(name: string) {
  if (inRoom()) return useRoom.getState().code!
  const code = newCode()
  const key = memberKey()
  saveName(name)
  const photos = useBooth.getState().photos
  ids = photos.map((p) => p?.id ?? null)
  photoOwner.clear()
  photos.forEach((p) => p && photoOwner.set(p.id, key))
  patch({
    code,
    role: 'host',
    status: 'ready',
    selfId: key,
    hostId: key,
    hostName: name,
    members: [{ id: key, name: name.trim().slice(0, 24), tone: 0, online: true }],
    owners: photos.map((p) => (p ? key : null)),
    transfer: {},
  })
  rememberRoom(code, 'host')
  await connect(code, 'host', name)
  return code
}

/** Masuk/buka-lagi ruang dijalankan berurutan supaya dua panggilan yang bersamaan tidak saling menimpa. */
let queue: Promise<unknown> = Promise.resolve()
function serial<T>(fn: () => Promise<T>) {
  const run = queue.then(fn)
  queue = run.catch(() => null)
  return run
}

export const joinRoom = (code: string, name: string) => serial(() => joinNow(code, name))

async function joinNow(code: string, name: string) {
  const s = useRoom.getState()
  if (s.code === code) return
  if (s.code) {
    await leaveRoom()
    // Panggilan lain sudah masuk duluan selama menunggu.
    if (inRoom()) return
  }
  welcomed = false
  ids = []
  received.clear()
  pendingOut.clear()
  patch({ code, role: 'guest', status: 'connecting', selfId: memberKey(), hostId: null, hostName: '', members: [], owners: [], transfer: {} })
  rememberRoom(code, 'guest')
  await connect(code, 'guest', name)
}

export function renameSelf(name: string) {
  saveName(name)
  const s = useRoom.getState()
  const n = name.trim().slice(0, 24)
  patch({ members: s.members.map((m) => (m.id === s.selfId ? { ...m, name: n } : m)) })
  if (s.role === 'host') hostBroadcast()
  else wire?.rename(n)
}

/**
 * Pesan frame sebelum memotret. Tuan rumah memutuskan; frame yang sudah dipesan orang lain tidak diberikan.
 * Di luar ruang semua frame boleh.
 */
export async function claimSlots(slots: number[]) {
  const s = useRoom.getState()
  if (!s.code) return slots
  if (s.role === 'host') return hostClaim(slots, s.selfId)
  if (s.status === 'host-left') return slots.filter((i) => s.owners[i] === null || s.owners[i] === s.selfId)
  if (s.status !== 'ready' || !wire) return []
  const granted = await wire.claim(slots)
  return Array.isArray(granted) ? granted : []
}

export async function leaveRoom() {
  clearTimeout(helpTimer)
  clearTimeout(saveTimer)
  unwatch()
  forgetRoom()
  const w = wire
  wire = null
  hostPeer = null
  peerKey.clear()
  keyPeer.clear()
  photoOwner.clear()
  ids = []
  received.clear()
  encoded.clear()
  pendingOut.clear()
  welcomed = false
  releaseAwake()
  patch({ code: null, role: null, status: 'connecting', hostId: null, hostName: '', members: [], owners: [], transfer: {}, inviteOpen: false })
  await w?.room.leave().catch(() => null)
}

// ------------------------------------------------------------------ tahan refresh (hanya di browser ini)

interface RoomStash {
  at: number
  code: string
  role: 'host' | 'guest'
  hostId: string | null
  hostName: string
  members: Member[]
  owners: (string | null)[]
  ids: (string | null)[]
  design: Design
  photos: (StoredPhoto | null)[]
  stripId: string
  patunganFrom: string | null
}

let unwatchers: (() => void)[] = []
/** Nomor sambungan terakhir; sambungan lama yang masih memuat trystero dibatalkan. */
let connects = 0
let saveTimer: ReturnType<typeof setTimeout> | undefined
let fallbackKey: string | null = null

function unwatch() {
  unwatchers.forEach((u) => u())
  unwatchers = []
}

function memberKey() {
  try {
    let k = localStorage.getItem(MEMBER_KEY)
    if (!k) localStorage.setItem(MEMBER_KEY, (k = newCode()))
    return k
  } catch {
    return (fallbackKey ??= newCode())
  }
}

function rememberRoom(code: string, role: 'host' | 'guest') {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ code, role }))
  } catch {
    /* mode privat: refresh menutup ruang seperti dulu */
  }
}

function forgetRoom() {
  try {
    sessionStorage.removeItem(SESSION_KEY)
  } catch {
    /* mode privat */
  }
  void idbDel(STASH_KEY).catch(() => null)
}

function rememberedRoom(): { code: string; role: 'host' | 'guest' } | null {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null')
  } catch {
    return null
  }
}

/** Simpan ruang + foto ke IndexedDB sebentar setelah ada perubahan (hanya di perangkat ini, tidak ke server). */
function saveSoon() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => void save(), 400)
}

async function save() {
  const s = useRoom.getState()
  if (!s.code || !s.role) return
  const b = useBooth.getState()
  try {
    const photos = await packPhotos(b.photos)
    if (useRoom.getState().code !== s.code) return
    const data: RoomStash = {
      at: Date.now(),
      code: s.code,
      role: s.role,
      hostId: s.hostId,
      hostName: s.hostName,
      members: s.members,
      owners: s.owners,
      ids,
      design: b.design,
      photos,
      stripId: b.stripId,
      patunganFrom: b.patunganFrom,
    }
    await idbPut(STASH_KEY, data)
  } catch {
    /* IndexedDB tidak tersedia: ruang tetap tersambung lagi, fotonya dikirim ulang tuan rumah */
  }
}

/**
 * Buka lagi ruang yang tadi dibuka di browser ini: setelah refresh (tanpa argumen), atau saat link ruang
 * dibuka lagi (`code`), termasuk oleh tuan rumah sendiri. Mengembalikan true kalau ruangnya dibuka lagi.
 */
export const resumeRoom = (code?: string) => serial(() => resumeNow(code))

async function resumeNow(code?: string) {
  if (inRoom()) return false
  const remembered = rememberedRoom()
  let stash = await idbGet<RoomStash>(STASH_KEY).catch(() => undefined)
  if (stash && Date.now() - stash.at > STASH_MAX_AGE) {
    void idbDel(STASH_KEY).catch(() => null)
    stash = undefined
  }
  const target = code ?? remembered?.code
  if (!target) return false
  if (stash?.code !== target) stash = undefined
  const role = stash?.role ?? (remembered?.code === target ? remembered.role : null)
  if (!role) return false

  if (stash) {
    const photos = await unpackPhotos(stash.photos).catch(() => null)
    if (inRoom()) return false
    if (photos) {
      applying = true
      try {
        useBooth.getState().restore(stash.design, photos, stash.stripId, stash.patunganFrom)
      } finally {
        applying = false
      }
    } else stash = undefined
  }

  // Selama membaca simpanan, halaman bisa sudah masuk ruang lain (mis. link ruang baru dibuka).
  if (inRoom()) return false
  const key = memberKey()
  const name = savedName()
  const photos = useBooth.getState().photos
  received.clear()
  pendingOut.clear()
  encoded.clear()
  if (role === 'host') {
    ids = stash?.ids.slice() ?? photos.map((p) => p?.id ?? null)
    photoOwner.clear()
    ids.forEach((id, i) => id && photoOwner.set(id, stash?.owners[i] ?? key))
    const others = (stash?.members ?? []).filter((m) => m.id !== key).map((m) => ({ ...m, online: false }))
    const self = stash?.members.find((m) => m.id === key)
    patch({
      code: target,
      role,
      status: 'ready',
      selfId: key,
      hostId: key,
      hostName: stash?.hostName ?? name,
      members: [{ id: key, name: self?.name ?? name, tone: 0, online: true }, ...others],
      owners: stash?.owners.slice() ?? photos.map((p) => (p ? key : null)),
      transfer: {},
    })
  } else {
    // Dengan foto tersimpan, sambutan tuan rumah tidak lagi mengosongkan strip.
    welcomed = !!stash
    ids = stash?.ids.slice() ?? []
    patch({
      code: target,
      role,
      status: 'connecting',
      selfId: key,
      hostId: stash?.hostId ?? null,
      hostName: stash?.hostName ?? '',
      members: (stash?.members ?? []).map((m) => (m.id === key ? m : { ...m, online: false })),
      owners: stash?.owners.slice() ?? [],
      transfer: {},
    })
  }
  rememberRoom(target, role)
  void connect(target, role, name).catch(() => null)
  return true
}

// ------------------------------------------------------------------ layar tetap menyala

let lock: WakeLockSentinel | null = null
async function requestAwake() {
  if (!inRoom() || document.visibilityState !== 'visible' || lock) return
  try {
    lock = await navigator.wakeLock?.request('screen')
    lock?.addEventListener('release', () => (lock = null))
  } catch {
    /* tidak didukung / ditolak */
  }
}
const onVisible = () => void requestAwake()
function keepAwake() {
  document.addEventListener('visibilitychange', onVisible)
  void requestAwake()
}
function releaseAwake() {
  document.removeEventListener('visibilitychange', onVisible)
  void lock?.release().catch(() => null)
  lock = null
}
