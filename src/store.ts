import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ASPECTS, layoutById, photoCount, type AspectId, type PhotoMode } from './lib/layouts'
import { filterById } from './lib/filters'
import { templateById } from './lib/templates'
import type { Overlay, Photo, RenderInput } from './lib/render'

export const newId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 20)

export interface Design {
  layoutId: string
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
  loadPatungan: (design: Design, photos: (Photo | null)[], from: string | null) => void
  /** Pulihkan sesi setelah kembali dari halaman login (ID strip dipertahankan supaya kuota tidak terhitung dua kali). */
  restore: (design: Design, photos: (Photo | null)[], stripId: string, from: string | null) => void
}

const defaultDesign: Design = {
  layoutId: 'strip-4',
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

export const useBooth = create<BoothState>()(
  persist(
    (set, get) => ({
      design: defaultDesign,
      settings: { countdown: 3, interval: 2, mirror: true, facing: 'user', sound: true, live: true },
      photos: sizePhotos([], photoCount(layoutById(defaultDesign.layoutId), defaultDesign.photoMode)),
      stripId: newId(),
      patunganFrom: null,

      setDesign: (patch) =>
        set((s) => {
          const design = { ...s.design, ...patch }
          const n = photoCount(layoutById(design.layoutId), design.photoMode)
          const resized = n !== s.photos.length
          return { design, photos: resized ? sizePhotos(s.photos, n) : s.photos, stripId: resized ? newId() : s.stripId }
        }),
      setLayout: (layoutId) => {
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
      resetPhotos: () => set((s) => ({ photos: s.photos.map(() => null), stripId: newId(), patunganFrom: null })),
      addOverlay: (o) => {
        const id = newId()
        set((s) => ({ design: { ...s.design, overlays: [...s.design.overlays, { ...o, id }] } }))
        return id
      },
      updateOverlay: (id, patch) =>
        set((s) => ({ design: { ...s.design, overlays: s.design.overlays.map((o) => (o.id === id ? { ...o, ...patch } : o)) } })),
      removeOverlay: (id) => set((s) => ({ design: { ...s.design, overlays: s.design.overlays.filter((o) => o.id !== id) } })),
      loadPatungan: (design, photos, from) =>
        set(() => ({
          design,
          photos: sizePhotos(photos, photoCount(layoutById(design.layoutId), design.photoMode)),
          stripId: newId(),
          patunganFrom: from,
        })),
      restore: (design, photos, stripId, from) =>
        set(() => ({
          design,
          photos: sizePhotos(photos, photoCount(layoutById(design.layoutId), design.photoMode)),
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
  const layout = layoutById(d.layoutId)
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
