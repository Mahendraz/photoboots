import { create } from 'zustand'
import type { JsonValue, Room } from 'trystero'
import { layoutById, photoCount } from './layouts'
import type { Photo } from './render'
import { useBooth, type Design } from '../store'

/**
 * "Foto bareng lewat link": ruang live antar-HP tanpa server kami.
 *
 * Pembuat ruang (tuan rumah) membagikan link `/app/bareng#<kode>`. Teman yang membuka link tersambung langsung
 * ke browser tuan rumah lewat WebRTC (Trystero); perkenalannya lewat relay Nostr publik, fotonya tidak.
 * Tuan rumah memegang keadaan ruang: siapa saja yang ikut, frame mana punya siapa, dan foto tiap frame.
 * Foto tamu dikirim ke tuan rumah lalu diteruskan ke tamu lain, jadi tamu cukup tersambung ke tuan rumah.
 * Kalau koneksi langsung gagal (sebagian jaringan seluler), berkas patungan .txt tetap jadi cadangan.
 */

const APP_ID = 'inwebbooth-bareng-v1'
const NAME_KEY = 'inwebbooth-name'
const SEND_SIDE = 1200
const MAX_MEMBERS = 10
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
  /** Tamu: tuan rumah menutup halaman. Foto yang sudah ada tetap bisa dihias & diunduh. */
  | 'host-left'
  | 'full'

interface RoomState {
  code: string | null
  role: 'host' | 'guest' | null
  status: RoomStatus
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
  owners: (string | null)[]
  /** ID foto tiap frame; tamu membandingkannya dengan fotonya sendiri. */
  ids: (string | null)[]
}
interface Welcome extends RoomSnapshot {
  design: Design
  hostName: string
}
interface PhotoMeta {
  slot: number
  id: string
  /** Ukuran byte gambar utama lalu tiap frame live, berurutan di dalam buffer. */
  sizes: number[]
}

interface Wire {
  room: Room
  hello: (data: { name: string }, to: string) => void
  rename: (name: string) => void
  welcome: (data: Welcome, to: string) => void
  full: (to: string) => void
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
let unsubscribe: (() => void) | null = null
let helpTimer: ReturnType<typeof setTimeout> | undefined
let welcomed = false

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

const slotCount = (d: Design = useBooth.getState().design) => photoCount(layoutById(d.layoutId), d.photoMode)

// ------------------------------------------------------------------ tuan rumah

function snapshot(): RoomSnapshot {
  const s = useRoom.getState()
  return { members: s.members, owners: s.owners, ids }
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

function hostOnHello(peerId: string, name: string) {
  const s = useRoom.getState()
  const known = s.members.find((m) => m.id === peerId)
  if (!known && s.members.filter((m) => m.online).length >= Math.min(MAX_MEMBERS, slotCount())) return wire?.full(peerId)
  const used = new Set(s.members.map((m) => m.tone))
  const tone = known?.tone ?? [...Array(MAX_MEMBERS).keys()].find((t) => !used.has(t)) ?? s.members.length
  const member: Member = { id: peerId, name: name.trim().slice(0, 24), tone, online: true }
  const members = known ? s.members.map((m) => (m.id === peerId ? member : m)) : [...s.members, member]
  patch({ members })
  const self = s.members.find((m) => m.id === s.selfId)
  wire?.welcome({ ...snapshot(), design: useBooth.getState().design, hostName: self?.name ?? '' }, peerId)
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
  const s = useRoom.getState()
  if (!s.members.some((m) => m.id === peerId)) return
  // Frame yang dipesan tapi belum difoto dilepas; foto yang sudah masuk tetap.
  const owners = s.owners.map((o, i) => (o === peerId && !ids[i] ? null : o))
  patch({ members: s.members.map((m) => (m.id === peerId ? { ...m, online: false } : m)), owners })
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

async function hostOnPhoto(buf: ArrayBuffer, meta: PhotoMeta, peerId: string) {
  const s = useRoom.getState()
  if (meta.slot < 0 || meta.slot >= s.owners.length || (s.owners[meta.slot] !== null && s.owners[meta.slot] !== peerId)) return
  const photo = await decodePhoto(buf, meta)
  encoded.set(meta.id, { buf, meta })
  ids[meta.slot] = meta.id
  const owners = useRoom.getState().owners.slice()
  owners[meta.slot] = peerId
  patch({ owners })
  applyPhoto(meta.slot, photo)
  hostBroadcast()
  if (wire) {
    const others = Object.keys(wire.room.getPeers()).filter((id) => id !== peerId)
    if (others.length) await wire.photo(buf, meta, others).catch(() => null)
  }
}

function hostOnRelease(slot: number, peerId: string) {
  const s = useRoom.getState()
  if (s.owners[slot] !== peerId) return
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
  patch({ owners })
  hostBroadcast()
  if (p) void hostSendPhoto(slot, p)
}

// ------------------------------------------------------------------ tamu

function guestApply(snap: RoomSnapshot) {
  const self = useRoom.getState().selfId
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
    if (id === null) applyPhoto(i, null)
    else {
      const p = received.get(id)
      if (p) applyPhoto(i, p)
    }
  })
}

async function guestOnPhoto(buf: ArrayBuffer, meta: PhotoMeta) {
  const photo = await decodePhoto(buf, meta)
  received.set(meta.id, photo)
  if (ids[meta.slot] === meta.id && useBooth.getState().photos[meta.slot]?.id !== meta.id) applyPhoto(meta.slot, photo)
}

async function guestOnLocal(slot: number, p: Photo | null) {
  const w = wire
  const host = useRoom.getState().hostId
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
  unsubscribe?.()
  unsubscribe = useBooth.subscribe((next, prev) => {
    if (applying || next.photos === prev.photos || !wire) return
    const { role, status } = useRoom.getState()
    if (status === 'host-left') return
    next.photos.forEach((p, i) => {
      if ((p?.id ?? null) === (prev.photos[i]?.id ?? null)) return
      if (role === 'host') hostOnLocal(i, p)
      else void guestOnLocal(i, p)
    })
  })
}

async function connect(code: string, role: 'host' | 'guest', name: string) {
  const { joinRoom, selfId } = await import('trystero')
  const room = joinRoom({ appId: APP_ID, password: code }, code)

  const hello = room.makeAction<{ name: string }>('hello')
  const rename = room.makeAction<string>('rename')
  const welcome = room.makeAction<JsonValue>('welcome')
  const full = room.makeAction<boolean>('full')
  const state = room.makeAction<JsonValue>('state')
  const claim = room.makeAction<number[], number[]>('claim', { kind: 'request' })
  const release = room.makeAction<number>('release')
  const photo = room.makeAction<ArrayBuffer>('photo')

  wire = {
    room,
    hello: (data, to) => void hello.send(data, { target: to }),
    rename: (n) => {
      const host = useRoom.getState().hostId
      if (host) void rename.send(n, { target: host })
    },
    welcome: (data, to) => void welcome.send(data as unknown as JsonValue, { target: to }),
    full: (to) => void full.send(true, { target: to }),
    state: (data) => void state.send(data as unknown as JsonValue),
    claim: (slots) => {
      const host = useRoom.getState().hostId
      if (!host) return Promise.resolve([])
      return claim.request(slots, { target: host, timeoutMs: 8000 }).catch(() => [])
    },
    release: (slot) => {
      const host = useRoom.getState().hostId
      if (host) void release.send(slot, { target: host })
    },
    photo: (buf, meta, to) => photo.send(buf, { target: to ?? null, metadata: meta as unknown as JsonValue }),
  }

  const onProgress = (p: number, { metadata }: { metadata?: JsonValue }) => {
    const slot = (metadata as unknown as PhotoMeta | undefined)?.slot
    if (typeof slot === 'number') setTransfer(slot, p)
  }

  patch({ selfId })

  if (role === 'host') {
    hello.onMessage = (d, { peerId }) => hostOnHello(peerId, d?.name ?? '')
    rename.onMessage = (n, { peerId }) => {
      const s = useRoom.getState()
      patch({ members: s.members.map((m) => (m.id === peerId ? { ...m, name: String(n).trim().slice(0, 24) } : m)) })
      hostBroadcast()
    }
    claim.onRequest = (slots, { peerId }) => hostClaim(Array.isArray(slots) ? slots : [], peerId)
    release.onMessage = (slot, { peerId }) => hostOnRelease(Number(slot), peerId)
    photo.onMessage = (buf, { peerId, metadata }) => void hostOnPhoto(buf, metadata as unknown as PhotoMeta, peerId)
    photo.onReceiveProgress = onProgress
    room.onPeerLeave = hostOnLeave
  } else {
    room.onPeerJoin = (peerId) => wire?.hello({ name }, peerId)
    welcome.onMessage = (d, { peerId }) => {
      const w = d as unknown as Welcome
      clearTimeout(helpTimer)
      if (!welcomed) {
        welcomed = true
        applying = true
        try {
          useBooth.getState().loadPatungan(w.design, [], w.hostName || null)
        } finally {
          applying = false
        }
      }
      patch({ hostId: peerId, hostName: w.hostName, status: 'ready' })
      guestApply(w)
    }
    full.onMessage = (_, { peerId }) => {
      if (welcomed) return
      clearTimeout(helpTimer)
      patch({ status: 'full', hostId: peerId })
    }
    state.onMessage = (d, { peerId }) => {
      if (peerId === useRoom.getState().hostId) guestApply(d as unknown as RoomSnapshot)
    }
    photo.onMessage = (buf, { peerId, metadata }) => {
      if (peerId === useRoom.getState().hostId) void guestOnPhoto(buf, metadata as unknown as PhotoMeta)
    }
    photo.onReceiveProgress = onProgress
    room.onPeerLeave = (peerId) => {
      if (peerId !== useRoom.getState().hostId) return
      // Lanjut sendiri: frame yang dipesan orang lain tapi belum difoto jadi bebas lagi.
      const photos = useBooth.getState().photos
      patch({ status: 'host-left', owners: useRoom.getState().owners.map((o, i) => (photos[i] ? o : null)) })
    }
    helpTimer = setTimeout(() => {
      if (useRoom.getState().status === 'connecting') patch({ status: 'slow' })
    }, CONNECT_HELP_MS)
  }

  watchLocal()
  keepAwake()
}

/** Buat ruang baru dari sesi sekarang; foto yang sudah ada jadi milik tuan rumah. */
export async function createRoom(name: string) {
  if (inRoom()) return useRoom.getState().code!
  const code = newCode()
  saveName(name)
  const photos = useBooth.getState().photos
  ids = photos.map((p) => p?.id ?? null)
  patch({ code, role: 'host', status: 'ready', hostId: null, hostName: name, members: [], owners: photos.map(() => null), transfer: {} })
  await connect(code, 'host', name)
  const self = useRoom.getState().selfId
  patch({
    hostId: self,
    members: [{ id: self, name: name.trim().slice(0, 24), tone: 0, online: true }],
    owners: photos.map((p) => (p ? self : null)),
  })
  return code
}

export async function joinRoom(code: string, name: string) {
  const s = useRoom.getState()
  if (s.code === code) return
  if (s.code) await leaveRoom()
  welcomed = false
  ids = []
  received.clear()
  pendingOut.clear()
  patch({ code, role: 'guest', status: 'connecting', hostId: null, hostName: '', members: [], owners: [], transfer: {} })
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
  unsubscribe?.()
  unsubscribe = null
  const w = wire
  wire = null
  ids = []
  received.clear()
  encoded.clear()
  pendingOut.clear()
  welcomed = false
  releaseAwake()
  patch({ code: null, role: null, status: 'connecting', hostId: null, hostName: '', members: [], owners: [], transfer: {}, inviteOpen: false })
  await w?.room.leave().catch(() => null)
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
