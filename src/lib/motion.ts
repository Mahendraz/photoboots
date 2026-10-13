import type { gsap as Gsap } from 'gsap'

export type GsapApi = typeof Gsap

let cached: GsapApi | null = null
let pending: Promise<GsapApi | null> | null = null

/**
 * GSAP untuk bagian yang ada di bundel utama (header, tirai): dimuat terpisah supaya pembukaan
 * pertama tetap ringan. Halaman yang dimuat belakangan (foto, hias, unduh, masuk) mengimpornya langsung.
 */
export function loadGsap(): Promise<GsapApi | null> {
  pending ??= import('gsap').then(
    (m) => (cached = m.gsap),
    () => ((pending = null), null),
  )
  return pending
}

/** GSAP kalau sudah termuat, tanpa menunggu. */
export const loadedGsap = () => cached

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
