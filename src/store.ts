import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ASPECTS, layoutById, photoCount, resolveLayout, type AspectId, type FormatId, type PhotoMode } from './lib/layouts'
import { filterById } from './lib/filters'
import { templateById } from './lib/templates'
import type { Overlay, Photo, RenderInput } from './lib/render'

export const newId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 20)

export interface Design {
  layoutId: string
  /** Ukuran hasil: cetak (300 dpi) atau format sosmed. */
  format: FormatId
  aspect: AspectId
  photoMode: PhotoMode
  templateId: string
  /** Template strip kanan (layout kiri–kanan). null = sama dengan kiri. */
  templateRightId: string | null
  filterId: string
  footerText: string | null
  showDate: boolean
  textFont: string | null
  textColor: string | null
  overlays: Overlay[]
}

export interface CaptureSettings {
  countdown: number
  /** Jeda antar jepretan otomatis (detik). */
  interval: number
  mirror: boolean
  facing: 'user' | 'environment'
  sound: boolean
  /** Rekam potongan pendek untuk GIF live. */
  live: boolean
}

interface BoothState {
  design: Design
  settings: CaptureSettings
  photos: (Photo | null)[]
  /**
   * Foto yang tidak muat setelah layout diganti ke jumlah frame yang lebih sedikit (mis. 6 → 3), disimpan
   * berurutan setelah `photos`. Kembali ke layout yang lebih banyak mengisinya lagi, jadi tidak perlu foto ulang.
   */
  sparePhotos: (Photo | null)[]
  /** Riwayat seluruh desain dan metadata overlay; tidak menyimpan bitmap foto. */
  overlayUndoStack: Design[]
  overlayRedoStack: Design[]
  canUndo: boolean
  canRedo: boolean
  overlayTransactionActive: boolean
  overlayTransactionRecorded: boolean
  /** ID strip untuk kuota: berganti tiap kali isi foto berubah. */
  stripId: string
  /** Nama pengirim berkas patungan (kalau sesi ini lanjutan dari teman). */
  patunganFrom: string | null

  setDesign: (patch: Partial<Design>) => void
  setLayout: (layoutId: string) => void
  setSettings: (patch: Partial<CaptureSettings>) => void
  setPhoto: (index: number, photo: Photo | null) => void
  resetPhotos: () => void
  addOverlay: (o: Omit<Overlay, 'id'>) => string
  updateOverlay: (id: string, patch: Partial<Overlay>) => void
  removeOverlay: (id: string) => void
  /** Pindahkan stiker ke paling depan / paling belakang tumpukan. */
  moveOverlay: (id: string, to: 'front' | 'back') => void
  beginOverlayTransaction: () => void
  endOverlayTransaction: () => void
  undo: () => void
  redo: () => void
  loadPatungan: (design: Design, photos: (Photo | null)[], from: string | null) => void
  /** Pulihkan sesi setelah kembali dari halaman login (ID strip dipertahankan supaya kuota tidak terhitung dua kali). */
  restore: (design: Design, photos: (Photo | null)[], stripId: string, from: string | null, sparePhotos?: (Photo | null)[]) => void
}

const defaultDesign: Design = {
  layoutId: 'strip-4',
  format: 'cetak',
  aspect: 'landscape',
  photoMode: 'beda',
  templateId: 'putih',
  templateRightId: null,
  filterId: 'normal',
  footerText: null,
  showDate: true,
  textFont: null,
  textColor: null,
  overlays: [],
}

const sizePhotos = (photos: (Photo | null)[], n: number) =>
  Array.from({ length: n }, (_, i) => photos[i] ?? null)

/** Bagi foto ke `n` frame yang terlihat; sisanya jadi cadangan (tanpa null di ekor). */
function splitPhotos(all: (Photo | null)[], n: number) {
  const spare = all.slice(n)
  while (spare.length && !spare[spare.length - 1]) spare.pop()
  return { photos: sizePhotos(all, n), sparePhotos: spare }
}


const DESIGN_HISTORY_LIMIT = 50

function cloneOverlays(overlays: Overlay[]) {
  return overlays.map((overlay) => ({ ...overlay }))
}

function cloneDesign(design: Design): Design {
  return { ...design, overlays: cloneOverlays(design.overlays) }
}

function sameOverlays(a: Overlay[], b: Overlay[]) {
  return a.length === b.length && a.every((overlay, i) => {
    const other = b[i]
    return (
      overlay.id === other.id &&
      overlay.kind === other.kind &&
      overlay.src === other.src &&
      overlay.text === other.text &&
      overlay.font === other.font &&
      overlay.color === other.color &&
      overlay.x === other.x &&
      overlay.y === other.y &&
      overlay.size === other.size &&
      overlay.rot === other.rot
    )
  })
}

function sameDesign(a: Design, b: Design) {
  return (
    a.layoutId === b.layoutId &&
    a.format === b.format &&
    a.aspect === b.aspect &&
    a.photoMode === b.photoMode &&
    a.templateId === b.templateId &&
    a.templateRightId === b.templateRightId &&
    a.filterId === b.filterId &&
    a.footerText === b.footerText &&
    a.showDate === b.showDate &&
    a.textFont === b.textFont &&
    a.textColor === b.textColor &&
    sameOverlays(a.overlays, b.overlays)
  )
}

function rememberDesignChange(s: BoothState, design: Design) {
  if (sameDesign(s.design, design)) return null
  const shouldRecord = !s.overlayTransactionActive || !s.overlayTransactionRecorded
  return {
    design: cloneDesign(design),
    overlayUndoStack: shouldRecord
      ? [...s.overlayUndoStack, cloneDesign(s.design)].slice(-DESIGN_HISTORY_LIMIT)
      : s.overlayUndoStack,
    overlayRedoStack: [],
    canUndo: shouldRecord || s.canUndo,
    canRedo: false,
    overlayTransactionRecorded: s.overlayTransactionActive,
  }
}

export const useBooth = create<BoothState>()(
  persist(
    (set, get) => ({
      design: defaultDesign,
      settings: { countdown: 3, interval: 2, mirror: true, facing: 'user', sound: true, live: true },
      photos: sizePhotos([], photoCount(layoutById(defaultDesign.layoutId), defaultDesign.photoMode)),
      sparePhotos: [],
      overlayUndoStack: [],
      overlayRedoStack: [],
      canUndo: false,
      canRedo: false,
      overlayTransactionActive: false,
      overlayTransactionRecorded: false,
      stripId: newId(),
      patunganFrom: null,

      setDesign: (patch) =>
        set((s) => {
          const design = { ...s.design, ...patch }
          const change = rememberDesignChange(s, design)
          if (!change) return {}
          const nextDesign = change.design
          const n = photoCount(layoutById(nextDesign.layoutId), nextDesign.photoMode)
          if (n === s.photos.length) return change
          return {
            ...change,
            ...splitPhotos([...s.photos, ...s.sparePhotos], n),
            stripId: newId(),
          }
        }),
      setLayout: (layoutId) => {
        if (get().design.layoutId === layoutId) return
        const l = layoutById(layoutId)
        get().setDesign({ layoutId, aspect: l.defaultAspect, overlays: [] })
      },
      setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      setPhoto: (index, photo) =>
        set((s) => {
          const photos = s.photos.slice()
          photos[index] = photo
          return { photos, stripId: newId() }
        }),
      resetPhotos: () => set((s) => ({ photos: s.photos.map(() => null), sparePhotos: [], stripId: newId(), patunganFrom: null })),
      addOverlay: (o) => {
        const id = newId()
        set((s) => rememberDesignChange(s, { ...s.design, overlays: [...s.design.overlays, { ...o, id }] }) ?? {})
        return id
      },
      updateOverlay: (id, patch) =>
        set((s) => {
          const overlays = s.design.overlays.map((o) => (o.id === id ? { ...o, ...patch } : o))
          return rememberDesignChange(s, { ...s.design, overlays }) ?? {}
        }),
      removeOverlay: (id) =>
        set((s) => rememberDesignChange(s, { ...s.design, overlays: s.design.overlays.filter((o) => o.id !== id) }) ?? {}),
      moveOverlay: (id, to) =>
        set((s) => {
          const o = s.design.overlays.find((x) => x.id === id)
          if (!o) return {}
          const rest = s.design.overlays.filter((x) => x.id !== id)
          const overlays = to === 'front' ? [...rest, o] : [o, ...rest]
          return rememberDesignChange(s, { ...s.design, overlays }) ?? {}
        }),
      beginOverlayTransaction: () =>
        set((s) => (s.overlayTransactionActive ? {} : { overlayTransactionActive: true, overlayTransactionRecorded: false })),
      endOverlayTransaction: () =>
        set((s) => (!s.overlayTransactionActive ? {} : { overlayTransactionActive: false, overlayTransactionRecorded: false })),
      undo: () =>
        set((s) => {
          if (!s.overlayUndoStack.length) {
            return { overlayTransactionActive: false, overlayTransactionRecorded: false }
          }
          const design = cloneDesign(s.overlayUndoStack[s.overlayUndoStack.length - 1])
          const overlayUndoStack = s.overlayUndoStack.slice(0, -1)
          const count = photoCount(layoutById(design.layoutId), design.photoMode)
          return {
            design,
            ...(count === s.photos.length ? {} : { ...splitPhotos([...s.photos, ...s.sparePhotos], count), stripId: newId() }),
            overlayUndoStack,
            overlayRedoStack: [...s.overlayRedoStack, cloneDesign(s.design)].slice(-DESIGN_HISTORY_LIMIT),
            canUndo: overlayUndoStack.length > 0,
            canRedo: true,
            overlayTransactionActive: false,
            overlayTransactionRecorded: false,
          }
        }),
      redo: () =>
        set((s) => {
          if (!s.overlayRedoStack.length) {
            return { overlayTransactionActive: false, overlayTransactionRecorded: false }
          }
          const design = cloneDesign(s.overlayRedoStack[s.overlayRedoStack.length - 1])
          const overlayRedoStack = s.overlayRedoStack.slice(0, -1)
          const count = photoCount(layoutById(design.layoutId), design.photoMode)
          return {
            design,
            ...(count === s.photos.length ? {} : { ...splitPhotos([...s.photos, ...s.sparePhotos], count), stripId: newId() }),
            overlayUndoStack: [...s.overlayUndoStack, cloneDesign(s.design)].slice(-DESIGN_HISTORY_LIMIT),
            overlayRedoStack,
            canUndo: true,
            canRedo: overlayRedoStack.length > 0,
            overlayTransactionActive: false,
            overlayTransactionRecorded: false,
          }
        }),
      loadPatungan: (design, photos, from) =>
        set(() => ({
          design,
          photos: sizePhotos(photos, photoCount(layoutById(design.layoutId), design.photoMode)),
          sparePhotos: [],
          overlayUndoStack: [],
          overlayRedoStack: [],
          canUndo: false,
          canRedo: false,
          overlayTransactionActive: false,
          overlayTransactionRecorded: false,
          stripId: newId(),
          patunganFrom: from,
        })),
      restore: (design, photos, stripId, from, sparePhotos = []) =>
        set(() => ({
          design,
          ...splitPhotos([...photos, ...sparePhotos], photoCount(layoutById(design.layoutId), design.photoMode)),
          overlayUndoStack: [],
          overlayRedoStack: [],
          canUndo: false,
          canRedo: false,
          overlayTransactionActive: false,
          overlayTransactionRecorded: false,
          stripId,
          patunganFrom: from,
        })),
    }),
    {
      name: 'photobooth-v1',
      // Foto tidak disimpan (privasi + ukuran); hanya pilihan desain & pengaturan kamera.
      partialize: (s) => ({ design: { ...s.design, overlays: [] }, settings: s.settings }),
      merge: (persisted, current) => {
        const p = persisted as Partial<BoothState>
        const design = { ...current.design, ...p.design }
        return {
          ...current,
          design,
          settings: { ...current.settings, ...p.settings },
          photos: sizePhotos([], photoCount(layoutById(design.layoutId), design.photoMode)),
        }
      },
    },
  ),
)

/** Input render dari state saat ini. */
export function renderInput(s: Pick<BoothState, 'design' | 'photos'>): RenderInput {
  const d = s.design
  const layout = resolveLayout(layoutById(d.layoutId), d.format ?? 'cetak', ASPECTS[d.aspect].ratio)
  const left = templateById(d.templateId)
  return {
    layout,
    aspect: ASPECTS[d.aspect].ratio,
    photoMode: d.photoMode,
    templates: layout.regions === 2 ? [left, templateById(d.templateRightId ?? d.templateId)] : [left],
    filter: filterById(d.filterId),
    photos: s.photos,
    footerText: d.footerText,
    showDate: d.showDate,
    textFont: d.textFont,
    textColor: d.textColor,
    overlays: d.overlays,
  }
}
