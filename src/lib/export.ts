import { GIFEncoder, applyPalette, quantize } from 'gifenc'
import { preloadAll, renderStrip, waitFonts, type RenderInput } from './render'
import { FONTS } from './templates'

export type Format = 'png' | 'jpg'

async function ready(input: RenderInput) {
  await Promise.all([preloadAll(input), waitFonts([...FONTS, ...input.overlays.map((o) => o.font ?? 'Fredoka')])])
}

export async function renderBlob(input: RenderInput, opts: { scale: number; watermark: boolean; format: Format }) {
  await ready(input)
  const canvas = document.createElement('canvas')
  renderStrip(canvas, input, { scale: opts.scale, watermark: opts.watermark })
  const type = opts.format === 'png' ? 'image/png' : 'image/jpeg'
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Gagal membuat gambar'))), type, 0.92),
  )
}

export const hasLive = (input: RenderInput) => input.photos.some((p) => p?.burst?.length)

/** GIF "live": tiap slot memutar potongan pendeknya bolak-balik (boomerang). */
export async function renderGif(input: RenderInput, opts: { watermark: boolean; onProgress?: (p: number) => void }) {
  await ready(input)
  const frames = Math.max(...input.photos.map((p) => p?.burst?.length ?? 1))
  const order = [...Array(frames).keys(), ...[...Array(Math.max(0, frames - 2)).keys()].map((i) => frames - 2 - i)]
  const scale = input.layout.width > 600 ? 0.4 : 0.5
  const canvas = document.createElement('canvas')
  const gif = GIFEncoder()
  for (let i = 0; i < order.length; i++) {
    renderStrip(canvas, input, { scale, burstFrame: order[i], watermark: opts.watermark })
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const palette = quantize(data, 256)
    gif.writeFrame(applyPalette(data, palette), width, height, { palette, delay: 100 })
    opts.onProgress?.((i + 1) / order.length)
    await new Promise((r) => setTimeout(r, 0))
  }
  gif.finish()
  return new Blob([gif.bytes() as BlobPart], { type: 'image/gif' })
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export const canShareFiles = (file: File) => typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })

export async function shareOrDownload(blob: Blob, name: string) {
  const file = new File([blob], name, { type: blob.type })
  if (canShareFiles(file)) {
    try {
      await navigator.share({ files: [file] })
      return 'shared'
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled'
    }
  }
  downloadBlob(blob, name)
  return 'downloaded'
}

export const fileName = (ext: string) => {
  const d = new Date()
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`
  return `photobooth-${stamp}.${ext}`
}
