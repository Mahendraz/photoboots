/**
 * Filter foto berbasis piksel (bukan ctx.filter) supaya hasilnya sama di semua browser,
 * termasuk Safari iPhone lama.
 */

export interface FilterDef {
  id: string
  name: string
  /** Saturasi (1 = asli, 0 = hitam putih). */
  sat?: number
  contrast?: number
  brightness?: number
  /** Geser warna: [r, g, b] ditambahkan setelah koreksi (−255..255). */
  tint?: [number, number, number]
  sepia?: number
  /** Angkat titik hitam (efek pudar). */
  fade?: number
  grain?: number
  vignette?: number
}

export const FILTERS: FilterDef[] = [
  { id: 'normal', name: 'Asli' },
  { id: 'bw', name: 'Hitam Putih', sat: 0, contrast: 1.12 },
  { id: 'noir', name: 'Noir', sat: 0, contrast: 1.45, brightness: -8, vignette: 0.45, grain: 10 },
  { id: 'sepia', name: 'Sepia', sepia: 0.85, contrast: 1.05 },
  { id: 'vintage', name: 'Vintage', sepia: 0.35, fade: 28, contrast: 0.95, tint: [12, 4, -10], vignette: 0.35, grain: 8 },
  { id: 'hangat', name: 'Hangat', sat: 1.1, tint: [16, 6, -12] },
  { id: 'dingin', name: 'Dingin', sat: 0.95, tint: [-10, 2, 16] },
  { id: 'soft', name: 'Soft Pink', sat: 0.9, brightness: 10, contrast: 0.9, tint: [12, -2, 6], fade: 12 },
  { id: 'pop', name: 'Pop', sat: 1.45, contrast: 1.15 },
  { id: 'pudar', name: 'Pudar', sat: 0.75, fade: 40, contrast: 0.88 },
  { id: 'film', name: 'Film', sat: 0.9, contrast: 1.08, tint: [-4, 6, -2], fade: 14, grain: 14, vignette: 0.25 },
  { id: 'cerah', name: 'Cerah', brightness: 18, contrast: 1.05, sat: 1.08 },
  { id: 'sore', name: 'Golden Hour', sat: 1.15, tint: [22, 8, -22], contrast: 1.04, vignette: 0.2 },
  { id: 'kusam', name: 'Moody', sat: 0.7, contrast: 1.2, brightness: -12, tint: [-4, 0, 6], vignette: 0.4 },
]

export const filterById = (id: string) => FILTERS.find((f) => f.id === id) ?? FILTERS[0]

export function applyFilter(canvas: HTMLCanvasElement | OffscreenCanvas, f: FilterDef) {
  if (f.id === 'normal') return
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
  const { width: w, height: h } = canvas
  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  const sat = f.sat ?? 1
  const contrast = f.contrast ?? 1
  const bright = f.brightness ?? 0
  const [tr, tg, tb] = f.tint ?? [0, 0, 0]
  const sepia = f.sepia ?? 0
  const fade = f.fade ?? 0
  const grain = f.grain ?? 0
  const vig = f.vignette ?? 0
  const cx = w / 2
  const cy = h / 2
  const maxD = Math.hypot(cx, cy)

  // Tabel kontras + kecerahan + pudar (sama untuk semua kanal).
  const lut = new Uint8ClampedArray(256)
  for (let i = 0; i < 256; i++) {
    let v = (i - 128) * contrast + 128 + bright
    v = fade + (v * (255 - fade)) / 255
    lut[i] = v
  }

  for (let y = 0; y < h; y++) {
    const vy = (y - cy) * (y - cy)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      let r = d[i]
      let g = d[i + 1]
      let b = d[i + 2]
      const l = 0.299 * r + 0.587 * g + 0.114 * b
      if (sat !== 1) {
        r = l + (r - l) * sat
        g = l + (g - l) * sat
        b = l + (b - l) * sat
      }
      if (sepia) {
        const sr = 0.393 * r + 0.769 * g + 0.189 * b
        const sg = 0.349 * r + 0.686 * g + 0.168 * b
        const sb = 0.272 * r + 0.534 * g + 0.131 * b
        r += (sr - r) * sepia
        g += (sg - g) * sepia
        b += (sb - b) * sepia
      }
      r = lut[r < 0 ? 0 : r > 255 ? 255 : r | 0] + tr
      g = lut[g < 0 ? 0 : g > 255 ? 255 : g | 0] + tg
      b = lut[b < 0 ? 0 : b > 255 ? 255 : b | 0] + tb
      if (vig) {
        const k = 1 - vig * Math.pow(Math.sqrt((x - cx) * (x - cx) + vy) / maxD, 2.2)
        r *= k
        g *= k
        b *= k
      }
      if (grain) {
        const n = (Math.random() - 0.5) * grain * 2
        r += n
        g += n
        b += n
      }
      d[i] = r
      d[i + 1] = g
      d[i + 2] = b
    }
  }
  ctx.putImageData(img, 0, 0)
}
