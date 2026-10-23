import type { Photo } from './render'

/**
 * Foto + rekaman live sebagai satu buffer byte (gambar utama lalu tiap frame live, berurutan) untuk dikirim antar-HP
 * (ruang live) atau dititipkan terenkripsi (estafet). `sizes` = ukuran tiap bagian di dalam buffer.
 */

const SEND_SIDE = 1200

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

export async function encodePhotoBytes(p: Photo) {
  const parts = [await toBlob(shrink(p.img, SEND_SIDE), 0.88), ...(await Promise.all((p.burst ?? []).map((f) => toBlob(f, 0.75))))]
  return { buf: await new Blob(parts).arrayBuffer(), sizes: parts.map((b) => b.size) }
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

export async function decodePhotoBytes(buf: ArrayBuffer, sizes: number[], id: string): Promise<Photo> {
  let at = 0
  const blobs = sizes.map((n) => {
    const b = new Blob([buf.slice(at, at + n)], { type: 'image/jpeg' })
    at += n
    return b
  })
  const [img, ...burst] = await Promise.all(blobs.map(blobToCanvas))
  return { id, img, burst: burst.length ? burst : undefined, source: 'friend' }
}
