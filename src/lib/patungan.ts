import { dataUrlToCanvas } from './media'
import type { Photo } from './render'
import { newId, type Design } from '../store'

/**
 * "Patungan": foto bareng teman dari jarak jauh tanpa server.
 * Satu orang mengisi sebagian slot lalu mengirim berkas patungan (lewat WhatsApp, dsb).
 * Temannya membuka berkas itu di web ini, mengisi slot yang kosong, lalu mengunduh strip jadi.
 * Berkas bisa dikirim bolak-balik sampai semua slot terisi.
 */

/**
 * Disimpan sebagai .txt (text/plain) karena menu bagikan Android/iOS hanya menerima jenis berkas umum;
 * isinya JSON. Berkas lama berekstensi .pbooth tetap bisa dibuka.
 */
export const PATUNGAN_ACCEPT = '.txt,.pbooth,text/plain,application/json'

interface PatunganFile {
  app: 'photobooth'
  v: 1
  from: string | null
  created: number
  design: Design
  photos: (string | null)[]
}

const MAX_SIDE = 1200

function toDataUrl(src: HTMLCanvasElement) {
  const k = Math.min(1, MAX_SIDE / Math.max(src.width, src.height))
  const c = document.createElement('canvas')
  c.width = Math.round(src.width * k)
  c.height = Math.round(src.height * k)
  c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.85)
}

export function buildPatungan(design: Design, photos: (Photo | null)[], from: string | null) {
  const data: PatunganFile = {
    app: 'photobooth',
    v: 1,
    from,
    created: Date.now(),
    design,
    photos: photos.map((p) => (p ? toDataUrl(p.img) : null)),
  }
  return new Blob([JSON.stringify(data)], { type: 'text/plain' })
}

export async function readPatungan(file: File) {
  if (file.size > 40 * 1024 * 1024) throw new Error('Berkas terlalu besar.')
  let data: PatunganFile
  try {
    data = JSON.parse(await file.text())
  } catch {
    throw new Error('Ini bukan berkas patungan photobooth.')
  }
  if (data.app !== 'photobooth' || data.v !== 1 || !Array.isArray(data.photos) || !data.design)
    throw new Error('Ini bukan berkas patungan photobooth.')
  const photos = await Promise.all(
    data.photos.map(async (url): Promise<Photo | null> => {
      if (typeof url !== 'string' || !url.startsWith('data:image/')) return null
      return { id: newId(), img: await dataUrlToCanvas(url), source: 'friend' }
    }),
  )
  return { design: data.design, photos, from: data.from }
}
