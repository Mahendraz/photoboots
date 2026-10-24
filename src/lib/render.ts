import { applyFilter, type FilterDef } from './filters'
import { photoForSlot, regionGeometry, regionRects, type LayoutDef, type PhotoMode, type Rect, type RegionGeometry } from './layouts'
import type { Anchor, Pattern, Template } from './templates'

export interface Photo {
  id: string
  /** Gambar penuh (sisi terpanjang ≤ 1600 px), belum dipotong & belum difilter. */
  img: HTMLCanvasElement
  /** Rekaman pendek kecil untuk GIF "live" (hanya foto dari kamera). */
  burst?: HTMLCanvasElement[]
  source: 'camera' | 'upload' | 'friend'
}

export interface Overlay {
  id: string
  kind: 'image' | 'emoji' | 'text'
  src?: string
  text?: string
  font?: string
  color?: string
  /** Titik tengah, pecahan dari lebar/tinggi kanvas. */
  x: number
  y: number
  /** Lebar (gambar) atau tinggi huruf (teks/emoji), pecahan dari lebar kanvas. */
  size: number
  rot: number
}

export interface RenderInput {
  layout: LayoutDef
  aspect: number
  photoMode: PhotoMode
  templates: Template[]
  filter: FilterDef
  photos: (Photo | null)[]
  footerText: string | null
  showDate: boolean
  textFont: string | null
  textColor: string | null
  overlays: Overlay[]
}

export interface RenderOptions {
  scale: number
  /** Indeks frame burst untuk GIF; undefined = foto diam. */
  burstFrame?: number
  watermark?: boolean
  /** Gambar placeholder bernomor di slot kosong (pratinjau). */
  placeholders?: boolean
  /** Lewati stiker pengguna (editor menggambarnya terpisah supaya geser stiker tetap ringan). */
  skipOverlays?: boolean
}

// ------------------------------------------------------------------ cache gambar (sprinkle & stiker)

const images = new Map<string, HTMLImageElement>()
const pending = new Map<string, Promise<HTMLImageElement | null>>()
const IMAGE_CACHE_LIMIT = 48
const IMAGE_CACHE_MAX_BYTES = 64 * 1024 * 1024

function imageBytes(image: HTMLImageElement) {
  return image.naturalWidth * image.naturalHeight * 4
}

function touchImage(src: string, image: HTMLImageElement) {
  images.delete(src)
  images.set(src, image)
}

function trimImageCache() {
  let bytes = [...images.values()].reduce((sum, image) => sum + imageBytes(image), 0)
  while (images.size > IMAGE_CACHE_LIMIT || bytes > IMAGE_CACHE_MAX_BYTES) {
    const oldest = images.entries().next().value as [string, HTMLImageElement] | undefined
    if (!oldest) break
    images.delete(oldest[0])
    bytes -= imageBytes(oldest[1])
  }
}

/**
 * URL gambar lintas-origin untuk dimuat dengan CORS (kanvas butuh CORS supaya bisa diekspor).
 *
 * CDN sprinkle hanya mengirim Access-Control-Allow-Origin kalau request membawa header Origin, tanpa
 * `Vary: Origin`. Begitu URL yang sama pernah dimuat lewat <img> biasa (tanpa crossorigin, mis. thumbnail
 * stiker), browser menyimpan respons tanpa header CORS (cache 1 tahun, immutable) lalu memakainya lagi
 * untuk request CORS dari kanvas, sehingga gagal. Query `cors` memberi kunci cache tersendiri yang
 * hanya dimuat dengan crossorigin, jadi tidak pernah tercemar respons non-CORS.
 */
export function corsSrc(src: string, attempt = 1) {
  const u = new URL(src, location.href)
  if (u.origin === location.origin) return src
  u.searchParams.set('cors', String(attempt))
  return u.href
}

const fetchImage = (src: string) =>
  new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })

export function isImageReady(src: string) {
  const image = images.get(src)
  if (!image) return false
  touchImage(src, image)
  return true
}

export function loadImage(src: string): Promise<HTMLImageElement | null> {
  const ready = images.get(src)
  if (ready) {
    touchImage(src, ready)
    return Promise.resolve(ready)
  }
  let p = pending.get(src)
  if (!p) {
    p = Promise.resolve().then(async () => {
      try {
        // Coba kedua dengan kunci cache baru, kalau entri pertama sudah tercemar dari versi lama aplikasi.
        const img = (await fetchImage(corsSrc(src))) ?? (src === corsSrc(src) ? null : await fetchImage(corsSrc(src, Date.now())))
        if (img) {
          images.set(src, img)
          trimImageCache()
        }
        return img
      } catch {
        return null
      } finally {
        // Hanya request yang sedang berjalan disimpan di sini; hasil cache punya batas ukurannya sendiri.
        pending.delete(src)
      }
    })
    pending.set(src, p)
  }
  return p
}

/** Latar bergambar template: versi kecil untuk thumbnail, versi penuh untuk pratinjau & ekspor. */
export const frameImageUrl = (id: string, scale: number) => (scale <= 0.15 ? `/frames/${id}-kecil.webp` : `/frames/${id}.webp`)

/** Semua URL gambar yang dibutuhkan satu render (untuk dimuat dulu sebelum ekspor). */
export function imageUrls(input: RenderInput, scale = 1) {
  const urls = new Set<string>()
  for (const t of input.templates) {
    for (const d of t.decor ?? []) urls.add(d.src)
    if (t.bg.image) urls.add(frameImageUrl(t.bg.image, scale))
  }
  for (const o of input.overlays) if (o.kind === 'image' && o.src) urls.add(o.src)
  return [...urls]
}

export const preloadAll = (input: RenderInput, scale = 1) => Promise.all(imageUrls(input, scale).map(loadImage))

export async function waitFonts(fonts: string[]) {
  if (!document.fonts) return
  await Promise.all(fonts.map((f) => document.fonts.load(`40px "${f}"`).catch(() => null)))
}

// ------------------------------------------------------------------ util

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7)

function roundRect(ctx: CanvasRenderingContext2D, r: Rect, radius: number) {
  const rad = Math.max(0, Math.min(radius, r.w / 2, r.h / 2))
  ctx.beginPath()
  ctx.moveTo(r.x + rad, r.y)
  ctx.arcTo(r.x + r.w, r.y, r.x + r.w, r.y + r.h, rad)
  ctx.arcTo(r.x + r.w, r.y + r.h, r.x, r.y + r.h, rad)
  ctx.arcTo(r.x, r.y + r.h, r.x, r.y, rad)
  ctx.arcTo(r.x, r.y, r.x + r.w, r.y, rad)
  ctx.closePath()
}

function archPath(ctx: CanvasRenderingContext2D, r: Rect) {
  const rad = Math.min(r.w / 2, r.h / 2)
  ctx.beginPath()
  ctx.moveTo(r.x, r.y + r.h)
  ctx.lineTo(r.x, r.y + rad)
  ctx.arc(r.x + r.w / 2, r.y + rad, r.w / 2, Math.PI, 0)
  ctx.lineTo(r.x + r.w, r.y + r.h)
  ctx.closePath()
}

function ticketPath(ctx: CanvasRenderingContext2D, r: Rect, notch: number) {
  ctx.beginPath()
  ctx.moveTo(r.x + notch, r.y)
  ctx.lineTo(r.x + r.w - notch, r.y)
  ctx.arc(r.x + r.w, r.y, notch, Math.PI, Math.PI / 2, true)
  ctx.lineTo(r.x + r.w, r.y + r.h - notch)
  ctx.arc(r.x + r.w, r.y + r.h, notch, -Math.PI / 2, Math.PI, true)
  ctx.lineTo(r.x + notch, r.y + r.h)
  ctx.arc(r.x, r.y + r.h, notch, 0, -Math.PI / 2, true)
  ctx.lineTo(r.x, r.y + notch)
  ctx.arc(r.x, r.y, notch, Math.PI / 2, 0, true)
  ctx.closePath()
}

const grow = (r: Rect, n: number): Rect => ({ x: r.x - n, y: r.y - n, w: r.w + n * 2, h: r.h + n * 2 })

function fillBackground(ctx: CanvasRenderingContext2D, r: Rect, bg: Template['bg']) {
  if (bg.color2) {
    const a = (((bg.angle ?? 180) - 90) * Math.PI) / 180
    const cx = r.x + r.w / 2
    const cy = r.y + r.h / 2
    const len = (Math.abs(r.w * Math.cos(a)) + Math.abs(r.h * Math.sin(a))) / 2
    const g = ctx.createLinearGradient(cx - Math.cos(a) * len, cy - Math.sin(a) * len, cx + Math.cos(a) * len, cy + Math.sin(a) * len)
    g.addColorStop(0, bg.color)
    g.addColorStop(1, bg.color2)
    ctx.fillStyle = g
  } else {
    ctx.fillStyle = bg.color
  }
  ctx.fillRect(r.x, r.y, r.w, r.h)
}

/** Gambar menutupi seluruh rect (object-fit: cover), dipotong di tengah. */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, r: Rect) {
  const k = Math.max(r.w / img.naturalWidth, r.h / img.naturalHeight)
  const sw = r.w / k
  const sh = r.h / k
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, r.x, r.y, r.w, r.h)
}

function heart(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.moveTo(x, y + s * 0.3)
  ctx.bezierCurveTo(x, y, x - s * 0.5, y, x - s * 0.5, y + s * 0.3)
  ctx.bezierCurveTo(x - s * 0.5, y + s * 0.6, x, y + s * 0.8, x, y + s)
  ctx.bezierCurveTo(x, y + s * 0.8, x + s * 0.5, y + s * 0.6, x + s * 0.5, y + s * 0.3)
  ctx.bezierCurveTo(x + s * 0.5, y, x, y, x, y + s * 0.3)
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, outer: number, points = 5, inner = 0.45) {
  for (let i = 0; i < points * 2; i++) {
    const rad = i % 2 ? outer * inner : outer
    const a = (Math.PI * i) / points - Math.PI / 2
    const px = x + Math.cos(a) * rad
    const py = y + Math.sin(a) * rad
    if (i) ctx.lineTo(px, py)
    else ctx.moveTo(px, py)
  }
  ctx.closePath()
}

const CONFETTI = ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93', '#ff70a6']

function drawPattern(ctx: CanvasRenderingContext2D, r: Rect, bg: Template['bg'], unit: number, seedKey: string) {
  const p: Pattern = bg.pattern ?? 'none'
  if (p === 'none') return
  const s = unit * (bg.patternScale ?? 1)
  const color = bg.patternColor ?? '#000000'
  const rand = mulberry32(hash(seedKey))
  ctx.save()
  ctx.beginPath()
  ctx.rect(r.x, r.y, r.w, r.h)
  ctx.clip()
  ctx.globalAlpha = bg.patternAlpha ?? 1
  ctx.fillStyle = color
  ctx.strokeStyle = color

  const cols = (step: number) => Math.ceil(r.w / step) + 1
  const rows = (step: number) => Math.ceil(r.h / step) + 1

  switch (p) {
    case 'dots': {
      const step = 46 * s
      ctx.beginPath()
      for (let j = 0; j < rows(step); j++)
        for (let i = 0; i < cols(step); i++) {
          const x = r.x + i * step + (j % 2 ? step / 2 : 0)
          const y = r.y + j * step
          ctx.moveTo(x + 8 * s, y)
          ctx.arc(x, y, 8 * s, 0, Math.PI * 2)
        }
      ctx.fill()
      break
    }
    case 'stripes': {
      const step = 44 * s
      for (let i = 0; i < cols(step); i++) ctx.fillRect(r.x + i * step, r.y, step / 2, r.h)
      break
    }
    case 'diagonal': {
      const step = 40 * s
      ctx.lineWidth = 12 * s
      ctx.beginPath()
      for (let i = -rows(step); i < cols(step) + rows(step); i++) {
        ctx.moveTo(r.x + i * step, r.y)
        ctx.lineTo(r.x + i * step - r.h, r.y + r.h)
      }
      ctx.stroke()
      break
    }
    case 'checker': {
      const step = 50 * s
      for (let j = 0; j < rows(step); j++)
        for (let i = 0; i < cols(step); i++) if ((i + j) % 2 === 0) ctx.fillRect(r.x + i * step, r.y + j * step, step, step)
      break
    }
    case 'gingham': {
      const step = 40 * s
      const a = ctx.globalAlpha
      ctx.globalAlpha = a * 0.5
      for (let i = 0; i < cols(step); i += 2) ctx.fillRect(r.x + i * step, r.y, step, r.h)
      for (let j = 0; j < rows(step); j += 2) ctx.fillRect(r.x, r.y + j * step, r.w, step)
      break
    }
    case 'grid': {
      const step = 40 * s
      ctx.lineWidth = Math.max(1, 2 * s)
      ctx.beginPath()
      for (let i = 0; i < cols(step); i++) {
        ctx.moveTo(r.x + i * step, r.y)
        ctx.lineTo(r.x + i * step, r.y + r.h)
      }
      for (let j = 0; j < rows(step); j++) {
        ctx.moveTo(r.x, r.y + j * step)
        ctx.lineTo(r.x + r.w, r.y + j * step)
      }
      ctx.stroke()
      break
    }
    case 'hearts': {
      const step = 70 * s
      ctx.beginPath()
      for (let j = 0; j < rows(step); j++)
        for (let i = 0; i < cols(step); i++) heart(ctx, r.x + i * step + (j % 2 ? step / 2 : 0), r.y + j * step - 12 * s, 26 * s)
      ctx.fill()
      break
    }
    case 'stars': {
      const n = Math.round((r.w * r.h) / (90 * 90 * s * s))
      for (let i = 0; i < n; i++) {
        ctx.beginPath()
        star(ctx, r.x + rand() * r.w, r.y + rand() * r.h, (4 + rand() * 9) * s, rand() > 0.5 ? 4 : 5, 0.42)
        ctx.fill()
      }
      break
    }
    case 'sparkles': {
      const n = Math.round((r.w * r.h) / (120 * 120 * s * s))
      ctx.lineWidth = 3 * s
      ctx.lineCap = 'round'
      for (let i = 0; i < n; i++) {
        const x = r.x + rand() * r.w
        const y = r.y + rand() * r.h
        const k = (8 + rand() * 10) * s
        ctx.beginPath()
        if (rand() > 0.4) {
          ctx.moveTo(x - k, y)
          ctx.lineTo(x + k, y)
          ctx.moveTo(x, y - k)
          ctx.lineTo(x, y + k)
        } else {
          ctx.arc(x, y, k * 0.5, 0, Math.PI * 2)
        }
        ctx.stroke()
      }
      break
    }
    case 'waves': {
      const step = 70 * s
      ctx.lineWidth = 16 * s
      for (let j = 0; j < rows(step); j++) {
        ctx.beginPath()
        for (let x = 0; x <= r.w + 10; x += 6 * s) {
          const y = r.y + j * step + Math.sin((x / (60 * s)) * Math.PI) * 12 * s
          if (x) ctx.lineTo(r.x + x, y)
          else ctx.moveTo(r.x + x, y)
        }
        ctx.stroke()
      }
      break
    }
    case 'zigzag': {
      const step = 60 * s
      ctx.lineWidth = 8 * s
      ctx.lineJoin = 'miter'
      for (let j = 0; j < rows(step); j++) {
        ctx.beginPath()
        for (let i = 0; i <= cols(20 * s); i++) {
          const y = r.y + j * step + (i % 2 ? 12 * s : -12 * s)
          if (i) ctx.lineTo(r.x + i * 20 * s, y)
          else ctx.moveTo(r.x, y)
        }
        ctx.stroke()
      }
      break
    }
    case 'confetti': {
      const n = Math.round((r.w * r.h) / (60 * 60 * s * s))
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = CONFETTI[Math.floor(rand() * CONFETTI.length)]
        ctx.save()
        ctx.translate(r.x + rand() * r.w, r.y + rand() * r.h)
        ctx.rotate(rand() * Math.PI)
        if (rand() > 0.5) ctx.fillRect(-7 * s, -3 * s, 14 * s, 6 * s)
        else {
          ctx.beginPath()
          ctx.arc(0, 0, 4.5 * s, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.restore()
      }
      break
    }
    case 'film': {
      const hw = 22 * unit
      const hh = 30 * unit
      const step = 56 * unit
      for (let y = r.y + 18 * unit; y < r.y + r.h; y += step) {
        roundRect(ctx, { x: r.x + 18 * unit, y, w: hw, h: hh }, 5 * unit)
        ctx.fill()
        roundRect(ctx, { x: r.x + r.w - 18 * unit - hw, y, w: hw, h: hh }, 5 * unit)
        ctx.fill()
      }
      break
    }
    case 'clouds': {
      const n = Math.round((r.w * r.h) / (220 * 220 * s * s)) + 2
      ctx.beginPath()
      for (let i = 0; i < n; i++) {
        const x = r.x + rand() * r.w
        const y = r.y + rand() * r.h
        const k = (22 + rand() * 18) * s
        ctx.moveTo(x + k, y)
        ctx.arc(x, y, k, 0, Math.PI * 2)
        ctx.moveTo(x + k * 1.9, y + k * 0.25)
        ctx.arc(x + k * 1.1, y + k * 0.25, k * 0.8, 0, Math.PI * 2)
        ctx.moveTo(x - k * 0.2, y + k * 0.3)
        ctx.arc(x - k * 0.9, y + k * 0.3, k * 0.7, 0, Math.PI * 2)
      }
      ctx.fill()
      break
    }
    case 'flowers': {
      const n = Math.round((r.w * r.h) / (110 * 110 * s * s))
      for (let i = 0; i < n; i++) {
        const x = r.x + rand() * r.w
        const y = r.y + rand() * r.h
        const k = (9 + rand() * 7) * s
        ctx.fillStyle = color
        ctx.beginPath()
        for (let p2 = 0; p2 < 5; p2++) {
          const a = (p2 / 5) * Math.PI * 2 + rand()
          ctx.moveTo(x + Math.cos(a) * k + k * 0.7, y + Math.sin(a) * k)
          ctx.arc(x + Math.cos(a) * k, y + Math.sin(a) * k, k * 0.7, 0, Math.PI * 2)
        }
        ctx.fill()
        ctx.fillStyle = '#ffd43b'
        ctx.beginPath()
        ctx.arc(x, y, k * 0.55, 0, Math.PI * 2)
        ctx.fill()
      }
      break
    }
    case 'noise': {
      // Jumlah butir mengikuti skala render supaya thumbnail tetap ringan.
      const n = Math.round(((r.w * r.h) / 60) * Math.min(1, ctx.getTransform().a))
      const d = Math.max(1, unit)
      for (let i = 0; i < n; i++) ctx.fillRect(r.x + rand() * r.w, r.y + rand() * r.h, d, d)
      break
    }
    case 'sunburst': {
      const cx = r.x + r.w / 2
      const cy = r.y + r.h * 0.95
      const R = Math.hypot(r.w, r.h)
      const rays = 24
      ctx.beginPath()
      for (let i = 0; i < rays; i += 2) {
        const a1 = (i / rays) * Math.PI * 2
        const a2 = ((i + 1) / rays) * Math.PI * 2
        ctx.moveTo(cx, cy)
        ctx.lineTo(cx + Math.cos(a1) * R, cy + Math.sin(a1) * R)
        ctx.lineTo(cx + Math.cos(a2) * R, cy + Math.sin(a2) * R)
        ctx.closePath()
      }
      ctx.fill()
      break
    }
  }
  ctx.restore()
}

// ------------------------------------------------------------------ foto per slot (dipotong + difilter, di-cache)

const slotCache = new Map<string, HTMLCanvasElement>()
const SLOT_CACHE_MAX_BYTES = 32 * 1024 * 1024
let slotCacheBytes = 0

function croppedPhoto(src: HTMLCanvasElement, key: string, w: number, h: number, filter: FilterDef) {
  const k = `${key}|${filter.id}|${w}x${h}`
  const hit = slotCache.get(k)
  if (hit) {
    slotCache.delete(k)
    slotCache.set(k, hit)
    return hit
  }
  const c = document.createElement('canvas')
  c.width = Math.max(1, w)
  c.height = Math.max(1, h)
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  const scale = Math.max(w / src.width, h / src.height)
  const sw = w / scale
  const sh = h / scale
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, w, h)
  applyFilter(c, filter)
  const bytes = c.width * c.height * 4
  if (bytes <= SLOT_CACHE_MAX_BYTES) {
    while (slotCacheBytes + bytes > SLOT_CACHE_MAX_BYTES && slotCache.size) {
      const oldest = slotCache.entries().next().value as [string, HTMLCanvasElement] | undefined
      if (!oldest) break
      slotCache.delete(oldest[0])
      slotCacheBytes -= oldest[1].width * oldest[1].height * 4
    }
    slotCache.set(k, c)
    slotCacheBytes += bytes
  }
  return c
}

export const clearPhotoCache = () => {
  slotCache.clear()
  slotCacheBytes = 0
}

function drawSlot(
  ctx: CanvasRenderingContext2D,
  t: Template,
  slot: Rect,
  unit: number,
  scale: number,
  photo: HTMLCanvasElement | null,
  photoKey: string,
  filter: FilterDef,
  label: string | null,
) {
  const st = t.slot
  const border = st.border * unit
  const radius = st.radius * unit
  const outer = grow(slot, border)

  // Bingkai di sekeliling foto
  if (st.style !== 'arch' && st.style !== 'ticket' && (border > 0 || st.shadow)) {
    ctx.save()
    if (st.shadow) {
      ctx.shadowColor = 'rgba(0,0,0,0.22)'
      ctx.shadowBlur = 14 * unit
      ctx.shadowOffsetY = 5 * unit
    }
    ctx.fillStyle = st.borderColor
    roundRect(ctx, outer, radius + (radius ? border : 0))
    ctx.fill()
    ctx.restore()
  }

  if (st.style === 'stamp') {
    // Tepi perangko bergerigi: lubangi tepi bingkai dengan warna latar.
    ctx.save()
    ctx.fillStyle = t.bg.color
    const hole = 7 * unit
    const step = hole * 2.6
    for (let x = outer.x + step / 2; x < outer.x + outer.w; x += step) {
      ctx.beginPath()
      ctx.arc(x, outer.y, hole, 0, Math.PI * 2)
      ctx.arc(x, outer.y + outer.h, hole, 0, Math.PI * 2)
      ctx.fill()
    }
    for (let y = outer.y + step / 2; y < outer.y + outer.h; y += step) {
      ctx.beginPath()
      ctx.arc(outer.x, y, hole, 0, Math.PI * 2)
      ctx.arc(outer.x + outer.w, y, hole, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  ctx.save()
  if (st.style === 'arch') archPath(ctx, slot)
  else if (st.style === 'ticket') ticketPath(ctx, slot, Math.min(slot.w, slot.h) * 0.09)
  else roundRect(ctx, slot, radius)
  ctx.clip()
  if (photo) {
    // Dipotong pada ukuran piksel akhir (slot × skala) supaya tajam.
    const w = Math.round(slot.w * scale)
    const h = Math.round(slot.h * scale)
    ctx.drawImage(croppedPhoto(photo, photoKey, w, h, filter), slot.x, slot.y, slot.w, slot.h)
  } else {
    ctx.fillStyle = 'rgba(128,128,128,0.28)'
    ctx.fillRect(slot.x, slot.y, slot.w, slot.h)
    if (label) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)'
      ctx.font = `700 ${Math.min(slot.w, slot.h) * 0.32}px "Fredoka", sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(label, slot.x + slot.w / 2, slot.y + slot.h / 2)
    }
  }
  ctx.restore()

  if (st.style === 'tape') {
    const tw = 90 * unit
    const th = 26 * unit
    for (const [x, y, rot] of [
      [slot.x + 10 * unit, slot.y - 2 * unit, -0.5],
      [slot.x + slot.w - 10 * unit, slot.y - 2 * unit, 0.5],
    ] as const) {
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(rot)
      ctx.fillStyle = 'rgba(255, 214, 165, 0.82)'
      ctx.fillRect(-tw / 2, -th / 2, tw, th)
      ctx.restore()
    }
  }
}

function drawSpaced(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, tracking: number) {
  if (!tracking) {
    ctx.fillText(text, x, y)
    return
  }
  const chars = [...text]
  const widths = chars.map((c) => ctx.measureText(c).width)
  const total = widths.reduce((a, b) => a + b, 0) + tracking * (chars.length - 1)
  let cx = x - total / 2
  const align = ctx.textAlign
  ctx.textAlign = 'left'
  chars.forEach((c, i) => {
    ctx.fillText(c, cx, y)
    cx += widths[i] + tracking
  })
  ctx.textAlign = align
}

function fitFont(ctx: CanvasRenderingContext2D, weight: string, size: number, font: string, text: string, maxW: number, tracking: number) {
  let px = size
  for (let i = 0; i < 20; i++) {
    ctx.font = `${weight} ${px}px "${font}"`
    const w = ctx.measureText(text).width + tracking * Math.max(0, [...text].length - 1)
    if (w <= maxW) break
    px *= 0.92
  }
  return px
}

function anchorPoint(g: RegionGeometry, a: Anchor, size: number): [number, number] {
  const first = g.slots[0]
  const lastRowStart = g.slots[g.slots.length - 1]
  const right = Math.max(...g.slots.map((s) => s.x + s.w))
  const fy = g.footer.y + g.footer.h / 2
  const edge = size / 2 + 18 * g.unit
  switch (a) {
    case 'tl':
      return [first.x, first.y]
    case 'tr':
      return [right, first.y]
    case 'bl':
      return [first.x, lastRowStart.y + lastRowStart.h]
    case 'br':
      return [right, lastRowStart.y + lastRowStart.h]
    case 'fl':
      return [g.region.x + edge, fy]
    case 'fr':
      return [g.region.x + g.region.w - edge, fy]
    case 'fc':
      return [g.region.x + g.region.w / 2, fy]
    case 'hc':
      return [g.region.x + g.region.w / 2, g.header.y + g.header.h / 2]
  }
}

function drawImageCentered(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, rot: number) {
  const h = (w * img.naturalHeight) / img.naturalWidth
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate((rot * Math.PI) / 180)
  ctx.drawImage(img, -w / 2, -h / 2, w, h)
  ctx.restore()
}

const formatDate = (d = new Date()) =>
  `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`

function drawRegion(ctx: CanvasRenderingContext2D, input: RenderInput, t: Template, g: RegionGeometry, slotOffset: number, opts: RenderOptions) {
  const { region, unit } = g
  fillBackground(ctx, region, t.bg)
  if (t.bg.image) {
    const art = images.get(frameImageUrl(t.bg.image, opts.scale)) ?? images.get(frameImageUrl(t.bg.image, 1)) ?? images.get(frameImageUrl(t.bg.image, 0))
    if (art) drawCover(ctx, art, region)
  }
  drawPattern(ctx, region, t.bg, unit, `${t.id}-${slotOffset}`)

  g.slots.forEach((slot, i) => {
    const slotIndex = slotOffset + i
    const pIndex = photoForSlot(input.layout, input.photoMode, slotIndex)
    const photo = input.photos[pIndex] ?? null
    let src = photo?.img ?? null
    let key = photo?.id ?? ''
    if (photo && opts.burstFrame !== undefined && photo.burst?.length) {
      const f = opts.burstFrame % photo.burst.length
      src = photo.burst[f]
      key = `${photo.id}#${f}`
    }
    drawSlot(ctx, t, slot, unit, opts.scale, src, key, input.filter, opts.placeholders ? String(pIndex + 1) : null)
  })

  // Hiasan template
  const decor = t.decor ?? []
  for (const d of decor) {
    const img = images.get(d.src)
    if (!img) continue
    const size = d.size * unit
    const [x, y] = anchorPoint(g, d.anchor, size)
    drawImageCentered(ctx, img, x + (d.dx ?? 0) * unit, y + (d.dy ?? 0) * unit, size, d.rot ?? 0)
  }

  if (t.header) {
    ctx.fillStyle = t.header.color
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `${t.header.size * unit}px "${t.header.font}"`
    ctx.fillText(t.header.text, region.x + region.w / 2, g.header.y + g.header.h / 2 + 10 * unit)
  }

  // Tulisan footer + tanggal
  const tx = t.text
  const font = input.textFont ?? tx.font
  const color = input.textColor ?? tx.color
  let label = input.footerText ?? tx.default
  if (tx.caps) label = label.toUpperCase()
  const sideDecor = decor.some((d) => d.anchor === 'fl' || d.anchor === 'fr')
  const maxW = region.w - (sideDecor ? 2 * (130 * unit) : 60 * unit)
  const tracking = (tx.tracking ?? 0) * unit
  const weight = tx.weight ?? '400'
  const cx = region.x + region.w / 2
  const fy = g.footer.y + g.footer.h / 2
  const px = fitFont(ctx, weight, tx.size * unit, font, label, maxW, tracking)
  const datePx = Math.max(16 * unit, Math.min(px * 0.42, 24 * unit))
  const hasDate = input.showDate
  const block = px + (hasDate ? datePx * 1.6 : 0)
  if (tx.plate && (label.trim() || hasDate)) {
    // Pelat label di belakang tulisan supaya tetap terbaca di atas pola ramai.
    const textW = label.trim() ? ctx.measureText(label).width + tracking * Math.max(0, [...label].length - 1) : 0
    const plateW = Math.min(region.w - 40 * unit, Math.max(textW, datePx * 7) + 56 * unit)
    const plateH = block + 30 * unit
    ctx.fillStyle = tx.plate
    roundRect(ctx, { x: cx - plateW / 2, y: fy - plateH / 2, w: plateW, h: plateH }, 16 * unit)
    ctx.fill()
  }
  ctx.font = `${weight} ${px}px "${font}"`
  ctx.fillStyle = color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  if (label.trim()) drawSpaced(ctx, label, cx, fy - block / 2 + px / 2, tracking)
  if (hasDate) {
    ctx.font = `700 ${datePx}px "Space Mono"`
    ctx.globalAlpha = 0.85
    drawSpaced(ctx, formatDate(), cx, fy + block / 2 - datePx / 2, 2 * unit)
    ctx.globalAlpha = 1
  }
}

function drawOverlay(ctx: CanvasRenderingContext2D, o: Overlay, W: number, H: number) {
  const x = o.x * W
  const y = o.y * H
  const size = o.size * W
  if (o.kind === 'image') {
    const img = o.src ? images.get(o.src) : null
    if (img) drawImageCentered(ctx, img, x, y, size, o.rot)
    return
  }
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate((o.rot * Math.PI) / 180)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  if (o.kind === 'emoji') {
    ctx.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`
    ctx.fillText(o.text ?? '', 0, size * 0.05)
  } else {
    ctx.font = `${size}px "${o.font ?? 'Fredoka'}"`
    ctx.fillStyle = o.color ?? '#1f1a17'
    ctx.lineJoin = 'round'
    ctx.fillText(o.text ?? '', 0, 0)
  }
  ctx.restore()
}

function drawWatermark(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const text = 'photobooth.inwebsite.online'
  const size = W * 0.045
  ctx.save()
  ctx.font = `700 ${size}px "Plus Jakarta Sans", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.translate(W / 2, H / 2)
  ctx.rotate(-Math.PI / 6)
  const stepX = ctx.measureText(text).width + size * 2
  const stepY = size * 4.2
  const R = Math.hypot(W, H)
  for (let y = -R / 2, row = 0; y < R / 2; y += stepY, row++)
    for (let x = -R / 2 + (row % 2 ? stepX / 2 : 0); x < R / 2; x += stepX) {
      ctx.lineWidth = size * 0.12
      ctx.strokeStyle = 'rgba(0,0,0,0.22)'
      ctx.strokeText(text, x, y)
      ctx.fillStyle = 'rgba(255,255,255,0.42)'
      ctx.fillText(text, x, y)
    }
  ctx.restore()
}

/** Ukuran kanvas pada skala tertentu. */
export const canvasSize = (layout: LayoutDef, scale: number) => ({
  width: Math.round(layout.width * scale),
  height: Math.round(layout.height * scale),
})

export function regions(input: RenderInput) {
  return regionRects(input.layout).map((r, i) => {
    const t = input.templates[i] ?? input.templates[0]
    return { template: t, geo: regionGeometry(input.layout, r, input.aspect, t.spacing) }
  })
}

export function renderStrip(canvas: HTMLCanvasElement, input: RenderInput, opts: RenderOptions) {
  const { width, height } = canvasSize(input.layout, opts.scale)
  if (canvas.width !== width) canvas.width = width
  if (canvas.height !== height) canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(opts.scale, 0, 0, opts.scale, 0, 0)
  ctx.clearRect(0, 0, input.layout.width, input.layout.height)

  const per = input.layout.cols * input.layout.rows
  regions(input).forEach(({ template, geo }, i) => drawRegion(ctx, input, template, geo, i * per, opts))

  if (input.layout.regions === 2) {
    // Garis potong tipis di tengah 4R
    ctx.save()
    ctx.strokeStyle = 'rgba(0,0,0,0.08)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(input.layout.width / 2, 0)
    ctx.lineTo(input.layout.width / 2, input.layout.height)
    ctx.stroke()
    ctx.restore()
  }

  if (!opts.skipOverlays) for (const o of input.overlays) drawOverlay(ctx, o, input.layout.width, input.layout.height)
  if (opts.watermark) drawWatermark(ctx, input.layout.width, input.layout.height)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
}

/** Gambar ulang hanya stiker pengguna di atas gambar dasar yang sudah dirender. */
export function composeOverlays(canvas: HTMLCanvasElement, base: HTMLCanvasElement, input: RenderInput, scale: number) {
  if (canvas.width !== base.width) canvas.width = base.width
  if (canvas.height !== base.height) canvas.height = base.height
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.drawImage(base, 0, 0)
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  for (const o of input.overlays) drawOverlay(ctx, o, input.layout.width, input.layout.height)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
}

/** Ukuran kotak stiker dalam satuan kanvas (untuk kotak seleksi di editor). */
export function overlayBox(o: Overlay, W: number): { w: number; h: number } {
  const size = o.size * W
  if (o.kind === 'image') {
    const img = o.src ? images.get(o.src) : null
    return { w: size, h: img ? (size * img.naturalHeight) / img.naturalWidth : size }
  }
  const ctx = measureCtx()
  ctx.font = o.kind === 'emoji' ? `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif` : `${size}px "${o.font ?? 'Fredoka'}"`
  return { w: Math.max(size * 0.6, ctx.measureText(o.text ?? '').width), h: size * 1.2 }
}

let measure: CanvasRenderingContext2D | null = null
const measureCtx = () => (measure ??= document.createElement('canvas').getContext('2d')!)
