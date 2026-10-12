/**
 * Layout strip. Semua ukuran dalam piksel pada 300 dpi:
 * - strip 2×6 inci  = 600 × 1800 px
 * - kertas 4R 4×6 inci = 1200 × 1800 px (dua strip berdampingan, dipotong di tengah)
 * Template menggambar per "region": satu region = satu strip (lebar 600) atau satu lembar grid.
 */

export type AspectId = 'landscape' | 'portrait' | 'square' | 'wide' | 'tall'
export const ASPECTS: Record<AspectId, { label: string; ratio: number }> = {
  landscape: { label: 'Landscape 4:3', ratio: 4 / 3 },
  portrait: { label: 'Portrait 3:4', ratio: 3 / 4 },
  square: { label: 'Kotak 1:1', ratio: 1 },
  wide: { label: 'Lebar 16:9', ratio: 16 / 9 },
  tall: { label: 'Tinggi 4:5', ratio: 4 / 5 },
}

export type PhotoMode = 'kembar' | 'beda'

export interface LayoutDef {
  id: string
  name: string
  desc: string
  /** Lebar & tinggi kanvas pada skala 1 (300 dpi). */
  width: number
  height: number
  /** Jumlah region (strip) berdampingan. 2 = strip kiri & kanan. */
  regions: 1 | 2
  cols: number
  rows: number
  defaultAspect: AspectId
  print: string
}

export const LAYOUTS: LayoutDef[] = [
  { id: 'strip-3', name: 'Strip 3', desc: '1 strip, 3 foto', width: 600, height: 1800, regions: 1, cols: 1, rows: 3, defaultAspect: 'square', print: 'Strip 2×6"' },
  { id: 'strip-4', name: 'Strip 4', desc: '1 strip, 4 foto klasik', width: 600, height: 1800, regions: 1, cols: 1, rows: 4, defaultAspect: 'landscape', print: 'Strip 2×6"' },
  { id: 'double-3', name: 'Kiri–Kanan 6', desc: '2 strip × 3 frame', width: 1200, height: 1800, regions: 2, cols: 1, rows: 3, defaultAspect: 'landscape', print: '4R, potong tengah' },
  { id: 'double-4', name: 'Kiri–Kanan 8', desc: '2 strip × 4 frame', width: 1200, height: 1800, regions: 2, cols: 1, rows: 4, defaultAspect: 'landscape', print: '4R, potong tengah' },
  { id: 'double-5', name: 'Kiri–Kanan 10', desc: '2 strip × 5 frame', width: 1200, height: 1800, regions: 2, cols: 1, rows: 5, defaultAspect: 'landscape', print: '4R, potong tengah' },
  { id: 'grid-4', name: 'Grid 4', desc: '2 × 2 foto', width: 1200, height: 1800, regions: 1, cols: 2, rows: 2, defaultAspect: 'portrait', print: '4R' },
  { id: 'grid-6', name: 'Grid 6', desc: '2 × 3 foto', width: 1200, height: 1800, regions: 1, cols: 2, rows: 3, defaultAspect: 'square', print: '4R' },
  { id: 'grid-8', name: 'Grid 8', desc: '2 × 4 foto', width: 1200, height: 1800, regions: 1, cols: 2, rows: 4, defaultAspect: 'landscape', print: '4R' },
  { id: 'grid-9', name: 'Grid 9', desc: '3 × 3 foto', width: 1200, height: 1800, regions: 1, cols: 3, rows: 3, defaultAspect: 'portrait', print: '4R' },
  { id: 'grid-10', name: 'Grid 10', desc: '2 × 5 foto', width: 1200, height: 1800, regions: 1, cols: 2, rows: 5, defaultAspect: 'landscape', print: '4R' },
  { id: 'polaroid', name: 'Polaroid', desc: '1 foto besar', width: 1200, height: 1800, regions: 1, cols: 1, rows: 1, defaultAspect: 'portrait', print: '4R' },
]

export const layoutById = (id: string) => LAYOUTS.find((l) => l.id === id) ?? LAYOUTS[1]

/**
 * Ukuran hasil. "cetak" memakai ukuran asli layout (300 dpi); sisanya ukuran standar media sosial.
 * Di format sosmed, layout satu region disusun ulang (kolom × baris) supaya fotonya sebesar mungkin
 * di kanvas itu; layout kiri–kanan tetap dua strip berdampingan.
 */
export type FormatId = 'cetak' | 'story' | 'feed' | 'square'
export const FORMATS: Record<FormatId, { label: string; desc: string; width: number; height: number }> = {
  cetak: { label: 'Cetak', desc: '300 dpi, strip 2×6" / 4R', width: 0, height: 0 },
  story: { label: 'Story · Reels · TikTok', desc: '9:16 · 1080×1920', width: 1080, height: 1920 },
  feed: { label: 'Feed IG', desc: '4:5 · 1080×1350', width: 1080, height: 1350 },
  square: { label: 'Kotak', desc: '1:1 · 1080×1080', width: 1080, height: 1080 },
}
export const FORMAT_IDS = Object.keys(FORMATS) as FormatId[]

/** Spasi acuan untuk memilih susunan terbaik (sama dengan template strip pada umumnya). */
const REF_SPACING: Spacing = { pad: 34, gap: 22, header: 0, footer: 190 }

export function resolveLayout(l: LayoutDef, format: FormatId, aspect: number): LayoutDef {
  const f = FORMATS[format]
  if (format === 'cetak' || !f) return l
  const base = { ...l, width: f.width, height: f.height, print: `${f.label} · ${f.desc}` }
  if (l.regions === 2) return base
  // Susunan asli dipertahankan (strip tetap terlihat strip) kecuali susunan lain (tanpa slot kosong)
  // membuat foto jauh lebih besar, mis. strip 4 di kanvas kotak menjadi 2 × 2.
  const n = l.cols * l.rows
  const slotArea = (cols: number) => {
    const g = regionGeometry({ ...base, cols, rows: n / cols }, { x: 0, y: 0, w: f.width, h: f.height }, aspect, REF_SPACING)
    return g.slots[0].w * g.slots[0].h
  }
  let best = base
  let bestArea = slotArea(l.cols) * 1.3
  for (let cols = 1; cols <= n; cols++) {
    if (n % cols || cols === l.cols) continue
    const area = slotArea(cols)
    if (area > bestArea) {
      best = { ...base, cols, rows: n / cols }
      bestArea = area
    }
  }
  return best
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** Jumlah slot foto per region. */
export const slotsPerRegion = (l: LayoutDef) => l.cols * l.rows
/** Jumlah slot yang terlihat di kanvas. */
export const totalSlots = (l: LayoutDef) => slotsPerRegion(l) * l.regions

/** Berapa foto yang perlu diambil. Strip kembar memakai foto yang sama di kiri & kanan. */
export function photoCount(l: LayoutDef, mode: PhotoMode) {
  return l.regions === 2 && mode === 'kembar' ? slotsPerRegion(l) : totalSlots(l)
}

/** Indeks foto yang mengisi slot ke-i (slot dihitung region kiri dulu, lalu kanan). */
export function photoForSlot(l: LayoutDef, mode: PhotoMode, slot: number) {
  return l.regions === 2 && mode === 'kembar' ? slot % slotsPerRegion(l) : slot
}

export interface Spacing {
  /** Semua dalam px pada region selebar 600 (diskalakan otomatis untuk region lebih lebar). */
  pad: number
  gap: number
  header: number
  footer: number
}

export interface RegionGeometry {
  region: Rect
  slots: Rect[]
  header: Rect
  footer: Rect
  unit: number
}

export function regionRects(l: LayoutDef): Rect[] {
  const w = l.width / l.regions
  return Array.from({ length: l.regions }, (_, i) => ({ x: i * w, y: 0, w, h: l.height }))
}

/**
 * Hitung posisi slot di satu region. Slot diletakkan mulai dari atas (setelah header),
 * sisa tinggi menjadi area footer untuk tulisan/tanggal/stiker template.
 */
export function regionGeometry(l: LayoutDef, region: Rect, aspect: number, sp: Spacing): RegionGeometry {
  // Satuan desain: region selebar 600 (strip) = 1. Dibatasi tinggi juga supaya kanvas pendek (1:1, 4:5)
  // tidak mendapat footer & margin yang terlalu besar. Untuk ukuran cetak hasilnya sama dengan lebar/600.
  const unit = Math.min(region.w / 600, region.h / 900)
  const pad = sp.pad * unit
  const gap = sp.gap * unit
  const header = sp.header * unit
  const footerMin = sp.footer * unit
  const { cols, rows } = l

  const contentW = region.w - pad * 2
  const contentH = region.h - pad * 2 - header - footerMin
  let slotW = (contentW - gap * (cols - 1)) / cols
  let slotH = slotW / aspect
  if (slotH * rows + gap * (rows - 1) > contentH) {
    slotH = (contentH - gap * (rows - 1)) / rows
    slotW = slotH * aspect
  }
  const totalW = slotW * cols + gap * (cols - 1)
  const totalH = slotH * rows + gap * (rows - 1)
  const x0 = region.x + pad + (contentW - totalW) / 2
  // Sisa tinggi dibagi: sebagian di atas foto, sisanya untuk area tulisan di bawah, supaya di kanvas
  // tinggi (Story 9:16) foto tidak menumpuk di atas dengan ruang kosong besar di bawah.
  const spare = contentH - totalH
  const y0 = region.y + pad + header + spare * 0.35

  const slots: Rect[] = []
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      slots.push({ x: x0 + c * (slotW + gap), y: y0 + r * (slotH + gap), w: slotW, h: slotH })

  const lastBottom = y0 + totalH
  return {
    region,
    slots,
    unit,
    header: { x: region.x, y: region.y, w: region.w, h: pad + header },
    footer: { x: region.x, y: lastBottom, w: region.w, h: region.y + region.h - lastBottom },
  }
}
