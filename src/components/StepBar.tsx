import { useLayoutEffect, useRef } from 'react'
import { loadedGsap, loadGsap, prefersReducedMotion } from '../lib/motion'

export const STEPS = [
  { path: '/app', label: 'Layout' },
  { path: '/app/foto', label: 'Foto' },
  { path: '/app/hias', label: 'Hias' },
  { path: '/app/unduh', label: 'Unduh' },
]

/** Panjang garis centang (untuk efek digambar). */
const CHECK = 14
/** Jeda antar langkah saat garis melewati beberapa langkah sekaligus. */
const GAP = 0.16

/** Keadaan diam: garis terisi sampai langkah aktif, langkah yang sudah lewat jadi centang. */
function paint(el: HTMLElement, step: number) {
  el.querySelectorAll<HTMLElement>('[data-fill]').forEach((f, k) => (f.style.transform = `scaleX(${k + 1 <= step ? 1 : 0})`))
  el.querySelectorAll<HTMLElement>('[data-num]').forEach((n, i) => {
    n.style.opacity = i < step ? '0' : '1'
    n.style.transform = i < step ? 'scale(0)' : 'none'
  })
  el.querySelectorAll<SVGPathElement>('[data-check]').forEach((c, i) => (c.style.strokeDashoffset = String(i < step ? 0 : CHECK)))
}

/**
 * Langkah di header, gerakannya dari snippet Checkout Stepper InWebAsset: saat maju garis tergambar
 * ke langkah berikutnya, angka langkah yang lewat berubah jadi centang, dan langkah aktif memantul.
 */
export function StepBar({ step }: { step: number }) {
  const root = useRef<HTMLOListElement>(null)
  const prev = useRef(step)

  useLayoutEffect(() => {
    const el = root.current
    const from = prev.current
    prev.current = step
    if (!el) return
    const gsap = loadedGsap()
    if (gsap) gsap.getTweensOf(el.querySelectorAll('[data-fill],[data-num],[data-check],[data-pill],[data-halo]')).forEach((t) => t.progress(1).kill())
    paint(el, step)
    if (!gsap) return void loadGsap()
    // Di luar 4 langkah (halaman masuk) atau tanpa animasi: langsung ke keadaan akhir.
    if (from === step || from < 0 || step < 0 || prefersReducedMotion()) return

    const q = gsap.utils.selector(el)
    const fills = q('[data-fill]')
    const nums = q('[data-num]')
    const checks = q('[data-check]')
    let arrive = 0
    if (step > from) {
      for (let i = from + 1; i <= step; i++) {
        const at = (i - from - 1) * GAP
        gsap.fromTo(fills[i - 1], { scaleX: 0 }, { scaleX: 1, duration: 0.36, delay: at, ease: 'power2.inOut' })
        // Langkah yang baru dilewati jadi centang begitu garisnya sampai.
        gsap.fromTo(nums[i - 1], { opacity: 1, scale: 1 }, { opacity: 0, scale: 0, duration: 0.2, delay: at })
        gsap.fromTo(checks[i - 1], { strokeDashoffset: CHECK }, { strokeDashoffset: 0, duration: 0.32, delay: at + 0.1, ease: 'power2.out' })
      }
      arrive = (step - from - 1) * GAP + 0.28
    } else {
      for (let i = step + 1; i <= from; i++) gsap.fromTo(fills[i - 1], { scaleX: 1 }, { scaleX: 0, duration: 0.24, ease: 'power2.in' })
      for (let i = step; i < from; i++) {
        gsap.fromTo(checks[i], { strokeDashoffset: 0 }, { strokeDashoffset: CHECK, duration: 0.16 })
        gsap.fromTo(nums[i], { opacity: 0, scale: 0 }, { opacity: 1, scale: 1, duration: 0.3, delay: 0.1, ease: 'back.out(1.6)' })
      }
    }
    gsap.fromTo(q('[data-pill]')[step], { scale: 0.8 }, { scale: 1, duration: 0.5, delay: arrive, ease: 'back.out(3)' })
    gsap.fromTo(q('[data-halo]')[step], { scale: 1, opacity: 0.45 }, { scale: 1.5, opacity: 0, duration: 1.1, delay: arrive, ease: 'sine.out', repeat: 1 })
  }, [step])

  return (
    <ol ref={root} className="mx-auto flex items-center gap-1 sm:gap-2" aria-label="Langkah">
      {STEPS.map((s, i) => (
        <li key={s.path} className="flex items-center gap-1 sm:gap-2">
          {i > 0 && (
            <span aria-hidden className="relative h-0.5 w-3 overflow-hidden rounded-full bg-border sm:w-6">
              <span data-fill className="absolute inset-0 origin-left bg-accent" />
            </span>
          )}
          <span className="relative">
            <span data-halo aria-hidden className="absolute inset-0 rounded-full bg-accent opacity-0" />
            <span
              data-pill
              aria-current={i === step ? 'step' : undefined}
              className={`relative flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-bold sm:text-sm ${
                i === step ? 'bg-accent text-white' : i < step ? 'text-text' : 'text-muted'
              }`}
            >
              <span className="relative grid place-items-center font-heading">
                <span data-num>{i + 1}</span>
                <svg viewBox="0 0 16 16" aria-hidden className="absolute size-3.5">
                  <path
                    data-check
                    d="m3.5 8.4 2.9 2.8 6-6.4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray={CHECK}
                  />
                </svg>
              </span>
              {/* Di HP sempit (< 360px) label langkah aktif ikut disembunyikan supaya tombol akun tidak terdorong keluar layar. */}
              <span className={i === step ? 'max-[359px]:sr-only' : 'max-sm:hidden'}>{s.label}</span>
              {i < step && <span className="sr-only">(selesai)</span>}
            </span>
          </span>
        </li>
      ))}
    </ol>
  )
}
