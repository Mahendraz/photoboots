import { decodePhotoBytes, encodePhotoBytes } from './photoCodec'
import { decryptBytes, decryptJson, encryptBytes, encryptJson, hashHex, linkKey } from './linkCrypto'
import type { Photo } from './render'
import { inRoom, leaveRoom, memberKey, newCode, savedName, useRoom, type Member } from './room'
import { useBooth, type Design } from '../store'

/**
 * Estafet foto bareng: satu orang memulai strip (layout + jatah frame per orang), memotret bagiannya, lalu
 * meneruskan link. Tiap teman membuka link yang sama, memotret jatahnya, dan meneruskannya lagi sampai penuh.
 * Tidak ada yang perlu online bersamaan.
 *
 * Foto dititipkan di server terenkripsi (kunci dari link setelah `#`, tidak pernah sampai ke server) dan dihapus
 * 4 jam setelah estafet dibuat. Server menegakkan aturan yang tidak butuh isi: satu frame satu orang, jatah per orang.
 * Keadaan estafet memakai store ruang (useRoom, mode `estafet`) supaya langkah Foto/Hias/Unduh langsung bisa dipakai.
 */

/** Tab ini sedang di estafet mana (bertahan saat refresh, hilang kalau tab ditutup). */
const SESSION_KEY = 'inwebbooth-relay'
/** Kunci tulis pembuat estafet (untuk menghapusnya), per kode. */
const OWNER_KEY = 'inwebbooth-relay-owner'
const POLL_MS = 6000

interface RelayMeta {
  design: Design
  creatorName: string
  creatorWho: string
  created: number
}
interface FrameHeader {
  id: string
  name: string
  sizes: number[]
}
interface RelayInfo {
  meta: string
  slots: number
  perPerson: number
  expiresAt: number
  frames: { slot: number; who: string; v: number }[]
}

let code: string | null = null
let key: CryptoKey | null = null
let rid = ''
let meta: RelayMeta | null = null
/** Versi frame yang sudah dimuat (slot → updated_at server). */
const versions = new Map<number, number>()
/** Nama tiap orang (who → nama) dari frame yang sudah dimuat. */
const names = new Map<string, string>()
/** Frame milik sendiri yang sedang diunggah (slot → ID foto). */
const pending = new Map<number, string>()
let applying = false
let pollTimer: ReturnType<typeof setInterval> | undefined
let endTimer: ReturnType<typeof setTimeout> | undefined
let unsubscribe: (() => void) | null = null
let syncing: Promise<void> | null = null

const patch = useRoom.setState
const enc = new TextEncoder()
const dec = new TextDecoder()

export const relayLink = (c: string) => `${location.origin}/app/estafet#${c}`
export const relayCode = () => code

function applyPhoto(slot: number, photo: Photo | null) {
  applying = true
  try {
    useBooth.getState().setPhoto(slot, photo)
  } finally {
    applying = false
  }
}

const api = (path = '') => `/api/relays/${rid}${path}`
const who = () => useRoom.getState().selfId

function remember(c: string) {
  try {
    sessionStorage.setItem(SESSION_KEY, c)
  } catch {
    /* mode privat: refresh perlu membuka link lagi */
  }
}
function remembered() {
  try {
    return sessionStorage.getItem(SESSION_KEY)
  } catch {
    return null
  }
}
function ownerKeys(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(OWNER_KEY) ?? '{}')
  } catch {
    return {}
  }
}
function saveOwnerKey(c: string, k: string) {
  try {
    // Hanya estafet yang masih mungkin hidup (≤ 4 jam) yang disimpan.
    const all = Object.fromEntries(Object.entries(ownerKeys()).slice(-5))
    localStorage.setItem(OWNER_KEY, JSON.stringify({ ...all, [c]: k }))
  } catch {
    /* tanpa kunci, estafet tetap habis sendiri setelah 4 jam */
  }
}

// ------------------------------------------------------------------ anggota & frame

function members(owners: (string | null)[]): Member[] {
  const self = who()
  const order: string[] = []
  if (meta) order.push(meta.creatorWho)
  owners.forEach((o) => o && !order.includes(o) && order.push(o))
  if (!order.includes(self)) order.push(self)
  return order.map((id, tone) => ({
    id,
    tone,
    online: true,
    name: id === self ? savedName() : (names.get(id) ?? (id === meta?.creatorWho ? meta.creatorName : '')),
  }))
}

function setOwners(owners: (string | null)[]) {
  patch({ owners, members: members(owners) })
}

async function sealFrame(p: Photo) {
  const { buf, sizes } = await encodePhotoBytes(p)
  const header = enc.encode(JSON.stringify({ id: p.id, name: savedName(), sizes } satisfies FrameHeader))
  const plain = new Uint8Array(4 + header.length + buf.byteLength)
  new DataView(plain.buffer).setUint32(0, header.length)
  plain.set(header, 4)
  plain.set(new Uint8Array(buf), 4 + header.length)
  return encryptBytes(key!, plain)
}

async function openFrame(sealed: ArrayBuffer) {
  const plain = await decryptBytes(key!, new Uint8Array(sealed))
  const n = new DataView(plain.buffer).getUint32(0)
  const header = JSON.parse(dec.decode(plain.slice(4, 4 + n))) as FrameHeader
  const photo = await decodePhotoBytes(plain.slice(4 + n).buffer, header.sizes, header.id)
  return { header, photo }
}

function expire() {
  clearInterval(pollTimer)
  clearTimeout(endTimer)
  patch({ status: 'expired' })
}

/** Ambil keadaan estafet dari server dan muat frame yang baru/berubah. */
function sync() {
  return (syncing ??= doSync().finally(() => (syncing = null)))
}

async function doSync() {
  const c = code
  if (!c || !key) return
  const res = await fetch(api(), { cache: 'no-store' }).catch(() => null)
  if (code !== c) return
  if (res?.status === 404) return expire()
  if (!res?.ok) return
  const info = (await res.json()) as RelayInfo
  if (code !== c) return
  const slots = useBooth.getState().photos.length
  const owners: (string | null)[] = Array.from({ length: slots }, () => null)
  const seen = new Set<number>()
  for (const f of info.frames) {
    if (f.slot >= slots) continue
    owners[f.slot] = f.who
    seen.add(f.slot)
  }
  // Frame yang sedang dipesan/diunggah sendiri tetap milik sendiri sampai server mengonfirmasi.
  const local = useRoom.getState().owners
  local.forEach((o, i) => {
    if (o === who() && owners[i] === null && (pending.has(i) || !useBooth.getState().photos[i])) owners[i] = o
  })
  setOwners(owners)

  for (const f of info.frames) {
    if (f.slot >= slots || versions.get(f.slot) === f.v || pending.has(f.slot)) continue
    const r = await fetch(api(`/frames/${f.slot}`), { cache: 'no-store' }).catch(() => null)
    if (!r?.ok || code !== c) continue
    try {
      const { header, photo } = await openFrame(await r.arrayBuffer())
      names.set(f.who, header.name)
      versions.set(f.slot, f.v)
      // Foto sendiri dari HP ini tidak perlu ditimpa salinan servernya.
      if (useBooth.getState().photos[f.slot]?.id !== photo.id) applyPhoto(f.slot, f.who === who() ? { ...photo, source: 'camera' } : photo)
    } catch {
      /* frame rusak / kunci salah: dilewati */
    }
  }
  // Frame yang dikosongkan pemiliknya.
  useBooth.getState().photos.forEach((p, i) => {
    if (p && !seen.has(i) && !pending.has(i) && versions.has(i)) {
      versions.delete(i)
      applyPhoto(i, null)
    }
  })
  setOwners(useRoom.getState().owners.slice())
}

// ------------------------------------------------------------------ foto sendiri

function setTransfer(slot: number, v: number | null) {
  const t = { ...useRoom.getState().transfer }
  if (v === null) delete t[slot]
  else t[slot] = v
  patch({ transfer: t })
}

async function upload(slot: number, p: Photo): Promise<void> {
  const c = code
  if (!c || !key) return
  pending.set(slot, p.id)
  setTransfer(slot, 0)
  try {
    const body = await sealFrame(p)
    setTransfer(slot, 0.5)
    const res = await fetch(api(`/frames/${slot}`), { method: 'PUT', headers: { 'X-Who': who(), 'content-type': 'application/octet-stream' }, body })
    if (code !== c) return
    if (res.ok) {
      versions.delete(slot)
      return
    }
    const err = (await res.json().catch(() => ({}))) as { error?: string; code?: string }
    if (err.code === 'taken') {
      // Frame keburu diisi teman: pindahkan foto ke frame kosong lain.
      pending.delete(slot)
      applyPhoto(slot, null)
      await sync()
      const owners = useRoom.getState().owners
      const free = useBooth.getState().photos.findIndex((x, i) => !x && owners[i] === null)
      if (free < 0) return patch({ notice: 'Frame-nya keburu diisi teman dan strip sudah penuh. Fotomu tidak masuk.' })
      const next = owners.slice()
      next[free] = who()
      setOwners(next)
      applyPhoto(free, p)
      patch({ notice: `Frame ${slot + 1} keburu diisi teman, fotomu dipindah ke frame ${free + 1}.` })
      return upload(free, p)
    }
    if (err.code === 'gone') return expire()
    // Jatah habis atau gagal lain: foto dibatalkan supaya strip di HP ini sama dengan punya teman-teman.
    applyPhoto(slot, null)
    const owners = useRoom.getState().owners.slice()
    owners[slot] = null
    setOwners(owners)
    patch({ notice: err.error ?? 'Foto gagal dikirim. Cek internet lalu foto lagi.' })
  } catch {
    applyPhoto(slot, null)
    patch({ notice: 'Foto gagal dikirim. Cek internet lalu foto lagi.' })
  } finally {
    if (pending.get(slot) === p.id) pending.delete(slot)
    setTransfer(slot, null)
  }
}

async function clearOwn(slot: number) {
  pending.delete(slot)
  versions.delete(slot)
  const owners = useRoom.getState().owners.slice()
  owners[slot] = null
  setOwners(owners)
  await fetch(api(`/frames/${slot}`), { method: 'DELETE', headers: { 'X-Who': who() } }).catch(() => null)
}

function watch() {
  unsubscribe?.()
  unsubscribe = useBooth.subscribe((next, prev) => {
    if (applying || next.photos === prev.photos || useRoom.getState().status === 'expired') return
    next.photos.forEach((p, i) => {
      if ((p?.id ?? null) === (prev.photos[i]?.id ?? null)) return
      if (p) void upload(i, p)
      else void clearOwn(i)
    })
  })
}

/** Pesan frame sebelum memotret: frame kosong (atau milik sendiri) selama jatah masih ada. */
export function relayClaim(slots: number[]) {
  const s = useRoom.getState()
  if (s.status === 'expired') {
    patch({ notice: 'Estafet sudah berakhir. Foto yang ada masih bisa dihias dan diunduh.' })
    return []
  }
  const self = s.selfId
  const per = s.perPerson ?? 1
  const owners = s.owners.slice()
  let mine = owners.filter((o) => o === self).length
  const granted: number[] = []
  for (const i of slots) {
    if (owners[i] === self) granted.push(i)
    else if (owners[i] === null && mine < per) {
      owners[i] = self
      mine++
      granted.push(i)
    }
  }
  if (granted.length < slots.length)
    patch({ notice: mine >= per ? `Jatahmu ${per} frame sudah terpakai. Ketuk frame-mu untuk foto ulang.` : 'Frame itu sudah diambil teman.' })
  else patch({ notice: null })
  setOwners(owners)
  return granted
}

// ------------------------------------------------------------------ mulai, buka, keluar

function begin(c: string, k: CryptoKey, id: string, info: { slots: number; perPerson: number; expiresAt: number }, role: 'host' | 'guest') {
  code = c
  key = k
  rid = id
  versions.clear()
  names.clear()
  pending.clear()
  remember(c)
  patch({
    code: c,
    mode: 'estafet',
    role,
    status: Date.now() < info.expiresAt ? 'ready' : 'expired',
    hostId: meta!.creatorWho,
    hostName: meta!.creatorName,
    perPerson: info.perPerson,
    expiresAt: info.expiresAt,
    transfer: {},
    notice: null,
    inviteOpen: false,
  })
  setOwners(useRoom.getState().owners.length === info.slots ? useRoom.getState().owners : Array.from({ length: info.slots }, () => null))
  watch()
  clearInterval(pollTimer)
  pollTimer = setInterval(() => document.visibilityState === 'visible' && void sync(), POLL_MS)
  clearTimeout(endTimer)
  endTimer = setTimeout(expire, Math.max(0, info.expiresAt - Date.now()))
  document.addEventListener('visibilitychange', onVisible)
}

const onVisible = () => {
  if (document.visibilityState === 'visible' && code) void sync()
}

/**
 * Mulai estafet dari sesi sekarang (layout + foto yang sudah ada jadi bagian pembuat). Jatah per orang tidak boleh
 * lebih kecil dari foto yang sudah diambil (pemanggil memastikan).
 */
export async function startRelay(perPerson: number, name: string) {
  if (inRoom()) await leaveRoom()
  const c = newCode(16)
  const k = await linkKey(c, 'relay')
  const id = await hashHex(`inwebbooth-relay:${c}`)
  const writeKey = newCode(24)
  const self = await hashHex(`${memberKey()}:${c}`)
  const booth = useBooth.getState()
  meta = { design: { ...booth.design, overlays: [] }, creatorName: name.trim().slice(0, 24), creatorWho: self, created: Date.now() }
  const res = await fetch(`/api/relays/${id}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key: writeKey, meta: await encryptJson(k, meta), slots: booth.photos.length, perPerson }),
  })
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'Estafet gagal dibuat. Cek internet lalu coba lagi.')
  const { expiresAt } = (await res.json()) as { expiresAt: number }
  saveOwnerKey(c, writeKey)
  patch({ selfId: self, owners: booth.photos.map((p) => (p ? self : null)) })
  begin(c, k, id, { slots: booth.photos.length, perPerson, expiresAt }, 'host')
  // Foto yang sudah diambil sebelum estafet dimulai langsung dititipkan.
  booth.photos.forEach((p, i) => p && void upload(i, p))
  return c
}

/** Buka estafet dari link (atau setelah refresh). false kalau estafetnya sudah berakhir / tidak ada. */
const opening = new Map<string, Promise<boolean>>()

export function openRelay(c: string) {
  if (code === c && useRoom.getState().mode === 'estafet') return Promise.resolve(true)
  // Dua pemanggil bersamaan (mis. halaman link + pemulihan setelah refresh) memakai satu pembukaan yang sama.
  let run = opening.get(c)
  if (!run) {
    run = openNow(c).finally(() => opening.delete(c))
    opening.set(c, run)
  }
  return run
}

async function openNow(c: string) {
  const k = await linkKey(c, 'relay')
  const id = await hashHex(`inwebbooth-relay:${c}`)
  const res = await fetch(`/api/relays/${id}`, { cache: 'no-store' }).catch(() => null)
  if (!res?.ok) return false
  const info = (await res.json()) as RelayInfo
  let m: RelayMeta
  try {
    m = await decryptJson<RelayMeta>(k, info.meta)
  } catch {
    return false
  }
  if (inRoom()) await leaveRoom()
  meta = m
  const self = await hashHex(`${memberKey()}:${c}`)
  applying = true
  try {
    useBooth.getState().loadPatungan(m.design, [], m.creatorName || null)
  } finally {
    applying = false
  }
  patch({ selfId: self, owners: [] })
  begin(c, k, id, info, self === m.creatorWho ? 'host' : 'guest')
  await sync()
  return true
}

/** Halaman dimuat ulang saat sedang estafet: buka lagi dari titipan server. */
export async function resumeRelay() {
  const c = remembered()
  if (!c || inRoom()) return
  if (!(await openRelay(c))) forget()
}

function forget() {
  try {
    sessionStorage.removeItem(SESSION_KEY)
  } catch {
    /* mode privat */
  }
}

/** Dipanggil leaveRoom: berhenti mengikuti estafet di HP ini (titipan di server tetap sampai 4 jam habis). */
export function leaveRelay() {
  clearInterval(pollTimer)
  clearTimeout(endTimer)
  unsubscribe?.()
  unsubscribe = null
  document.removeEventListener('visibilitychange', onVisible)
  forget()
  code = null
  key = null
  meta = null
  versions.clear()
  names.clear()
  pending.clear()
}

export const isRelayOwner = (c: string | null) => !!c && !!ownerKeys()[c]

/** Pembuat estafet menghapus semua foto dari server sekarang juga. */
export async function deleteRelay() {
  const c = code
  const k = c ? ownerKeys()[c] : null
  if (!c || !k) return
  await fetch(api(), { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: k }) }).catch(() => null)
  expire()
}

export const syncRelay = () => sync()
