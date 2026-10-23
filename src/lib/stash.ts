import type { Photo } from './render'
import { useBooth, type Design } from '../store'

/**
 * Login berpindah halaman (ke Auth0 lalu kembali), padahal foto hanya ada di memori.
 * Sebelum pindah, sesi disimpan sementara di IndexedDB perangkat ini (tidak ke server),
 * lalu dipulihkan dan langsung dihapus begitu aplikasi terbuka lagi.
 * Penyimpanan yang sama dipakai ruang foto bareng supaya tahan refresh (lihat room.ts).
 */

const DB = 'photobooth'
const STORE = 'stash'
const KEY = 'session'
const MAX_AGE = 30 * 60_000

export interface StoredPhoto {
  id: string
  img: Blob
  burst?: Blob[]
  source: Photo['source']
}
interface Stash {
  at: number
  design: Design
  photos: (StoredPhoto | null)[]
  stripId: string
  patunganFrom: string | null
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  } finally {
    db.close()
  }
}

export const idbGet = <T>(key: string) => tx<T | undefined>('readonly', (st) => st.get(key))
export const idbPut = (key: string, value: unknown) => tx('readwrite', (st) => st.put(value, key))
export const idbDel = (key: string) => tx('readwrite', (st) => st.delete(key))

const toBlob = (c: HTMLCanvasElement, q: number) =>
  new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/jpeg', q))

async function toCanvas(b: Blob) {
  const bmp = await createImageBitmap(b)
  const c = document.createElement('canvas')
  c.width = bmp.width
  c.height = bmp.height
  c.getContext('2d')!.drawImage(bmp, 0, 0)
  bmp.close()
  return c
}

/** Foto yang sudah dikodekan, supaya simpanan berulang (ruang foto bareng) tidak mengodekan ulang semuanya. */
const packed = new WeakMap<Photo, Promise<StoredPhoto>>()

export function packPhotos(photos: (Photo | null)[]) {
  return Promise.all(
    photos.map((p) => {
      if (!p) return null
      let s = packed.get(p)
      if (!s) {
        s = (async () => ({
          id: p.id,
          img: await toBlob(p.img, 0.95),
          burst: p.burst ? await Promise.all(p.burst.map((f) => toBlob(f, 0.85))) : undefined,
          source: p.source,
        }))()
        s.catch(() => packed.delete(p))
        packed.set(p, s)
      }
      return s
    }),
  )
}

export function unpackPhotos(photos: (StoredPhoto | null)[]) {
  return Promise.all(
    photos.map(async (p): Promise<Photo | null> =>
      p
        ? {
            id: p.id,
            img: await toCanvas(p.img),
            burst: p.burst ? await Promise.all(p.burst.map(toCanvas)) : undefined,
            source: p.source,
          }
        : null,
    ),
  )
}

/** Simpan sesi saat ini. Aman dipanggil walau belum ada foto (tidak menyimpan apa-apa). */
export async function stashSession() {
  const s = useBooth.getState()
  if (!s.photos.some(Boolean)) return
  try {
    const data: Stash = { at: Date.now(), design: s.design, photos: await packPhotos(s.photos), stripId: s.stripId, patunganFrom: s.patunganFrom }
    await idbPut(KEY, data)
  } catch {
    /* IndexedDB tidak tersedia: login tetap jalan, foto sesi ini saja yang hilang */
  }
}

/** Pulihkan sesi yang disimpan sebelum login. Mengembalikan true kalau ada yang dipulihkan. */
export async function restoreSession() {
  try {
    const data = await idbGet<Stash>(KEY)
    if (!data) return false
    await idbDel(KEY)
    if (Date.now() - data.at > MAX_AGE) return false
    useBooth.getState().restore(data.design, await unpackPhotos(data.photos), data.stripId, data.patunganFrom)
    return true
  } catch {
    return false
  }
}
