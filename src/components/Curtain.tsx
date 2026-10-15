import { useCallback, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { loadGsap, prefersReducedMotion, type GsapApi } from '../lib/motion'
import { Logo } from './Logo'

const PANELS = 7
/** Warna tirai: satu aksen di semua langkah (design system InWebsite, tanpa warna-warni). */
const COLORS: Record<string, string> = {
  '/app': 'var(--color-accent)',
  '/app/foto': 'var(--color-accent)',
  '/app/hias': 'var(--color-accent)',
  '/app/unduh': 'var(--color-accent)',
}

type Run = (to: string, x: number | null, after?: () => void) => void
let runner: Run | null = null

/**
 * Pindah langkah lewat tirai. `after` dijalankan tepat setelah pindah halaman, saat layar tertutup
 * (mis. mengosongkan foto untuk "Foto lagi" tanpa halaman lama sempat bereaksi).
 */
export function useStepNav() {
  const navigate = useNavigate()
  return useCallback(
    (to: string, e?: { clientX: number } | null, after?: () => void) => {
      if (runner) runner(to, e?.clientX ?? null, after)
      else {
        navigate(to)
        after?.()
      }
    },
    [navigate],
  )
}

const wait = (ms: number) => new Promise<null>((r) => setTimeout(() => r(null), ms))
const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))

/**
 * Transisi antar langkah dari snippet Curtain Page Transition InWebAsset: panel tirai turun bergiliran
 * dari sisi yang diklik, logo berputar selagi halaman berganti di baliknya, lalu tirai terangkat.
 * Header tetap terlihat, jadi garis langkah di atas ikut tergambar saat tirai turun.
 */
export function Curtain() {
  const root = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const path = useRef(pathname)
  const onPath = useRef<(() => void) | null>(null)

  useEffect(() => {
    path.current = pathname
    onPath.current?.()
  }, [pathname])

  useEffect(() => {
    // Muat GSAP saat browser senggang, supaya tirai pertama tidak menunggu.
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1500))
    idle(() => void loadGsap())

    let busy = false
    let queued: Parameters<Run> | null = null
    let alive = true
    const plain: Run = (to, _x, after) => {
      navigate(to)
      after?.()
    }
    // Menunggu halaman benar-benar berganti (halaman lazy dimuat dulu; di koneksi lambat bisa lama), paling lama 15 detik.
    const pathChange = (start: string) =>
      new Promise<void>((resolve) => {
        const check = () => path.current !== start && done()
        const timer = setTimeout(() => done(), 15000)
        const done = () => {
          clearTimeout(timer)
          if (onPath.current === check) onPath.current = null
          resolve()
        }
        onPath.current = check
      })

    const run: Run = async (to, x, after) => {
      const el = root.current
      if (busy) return void (queued = [to, x, after])
      if (!el || to === path.current || prefersReducedMotion()) return plain(to, x, after)
      busy = true
      const gsap = (await Promise.race([loadGsap(), wait(400)])) as GsapApi | null
      if (!gsap || !alive) {
        busy = false
        return plain(to, x, after)
      }
      const panels = el.querySelectorAll<HTMLElement>('[data-panel]')
      const badge = el.querySelector<HTMLElement>('[data-badge]')
      const from = gsap.utils.clamp(0, PANELS - 1, Math.floor(((x ?? innerWidth / 2) / innerWidth) * PANELS))
      panels.forEach((p) => (p.style.backgroundColor = COLORS[to] ?? COLORS['/app']))
      el.style.pointerEvents = 'auto'
      gsap.set(panels, { y: 0, yPercent: -101 })
      gsap.set(badge, { autoAlpha: 0, scale: 0 })

      await gsap.to(panels, { yPercent: 0, duration: 0.3, ease: 'power3.in', stagger: { each: 0.025, from } })
      const badgeIn = gsap
        .timeline()
        .fromTo(badge, { autoAlpha: 1, scale: 0, rotation: -120 }, { scale: 1, rotation: 0, duration: 0.28, ease: 'back.out(2.6)' })
        .to(badge, { rotation: '+=360', duration: 0.9, ease: 'none', repeat: -1 })
      const start = path.current
      const changed = pathChange(start)
      navigate(to)
      after?.()
      await changed
      await frame()
      await wait(Math.max(0, 280 - badgeIn.time() * 1000))
      badgeIn.kill()
      await gsap
        .timeline()
        .to(badge, { scale: 0, rotation: '+=120', autoAlpha: 0, duration: 0.2, ease: 'back.in(2.5)' })
        .to(panels, { yPercent: -101, duration: 0.36, ease: 'power3.inOut', stagger: { each: 0.025, from } }, '<0.04')
      el.style.pointerEvents = 'none'
      busy = false
      if (queued && alive) {
        const next = queued
        queued = null
        run(...next)
      }
    }
    runner = run
    return () => {
      alive = false
      runner = null
    }
  }, [navigate])

  return (
    <div ref={root} aria-hidden className="pointer-events-none absolute inset-0 z-40 flex overflow-hidden">
      {Array.from({ length: PANELS }, (_, i) => (
        <span
          key={i}
          data-panel
          className={`-mx-px block h-[135%] flex-1 rounded-b-[999px] ${i % 2 ? 'brightness-90' : ''}`}
          style={{ transform: 'translateY(-101%)' }}
        />
      ))}
      <span
        data-badge
        className="invisible absolute top-1/2 left-1/2 -mt-9 -ml-9 grid size-18 place-items-center rounded-full border border-border bg-surface shadow-lg"
      >
        <Logo className="size-11" />
      </span>
    </div>
  )
}
