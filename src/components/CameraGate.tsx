import { useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'

gsap.registerPlugin(useGSAP)

const SP = 'https://inassetweb-cdn.inwebsite.online/sprinkles'
// Dua tangan pembingkai dipotong dari satu gambar (tangan kanan atas / kiri bawah) supaya bisa
// ditarik menjauh dan membuka bingkai. Poligon potongannya mengikuti gambar ini persis.
const FRAME = `${SP}/v1/hands/hand-flat-frame-camera.webp`
const STOP = `${SP}/v1/hands/hand-flat-stop.webp`
const OPEN_PALM = `${SP}/v1/hands/hand-flat-open-palm.webp`
const TOP_RIGHT = 'polygon(0 0, 100% 0, 100% 100%, 74% 100%, 74% 54.5%, 36% 54.5%, 36% 36%, 0 36%)'
const BOTTOM_LEFT = 'polygon(0 36%, 36% 36%, 36% 54.5%, 74% 54.5%, 74% 100%, 0 100%)'
/** Celah di antara jari, relatif terhadap gambar tangan. */
const WIN = { x: 0.33, y: 0.33, w: 0.32, h: 0.24 }
/** Celah itu jendela ke kamera; sisanya ditutup bayangan tinta yang sangat lebar. */
const SHADE = '0 0 0 200vmax rgba(31,26,23,1)'
const CLEAR = '0 0 0 200vmax rgba(31,26,23,0)'
const PAD = 10

export type GateState = 'opening' | 'ready' | 'error'

/**
 * Lapisan di atas kamera, dari snippet Camera Frame Permission InWebAsset. Selagi kamera dibuka, dua
 * tangan membingkai; begitu siap, celah di antara jari melebar jadi jendela bidik penuh dan tersisa
 * sudut-sudut bidik. Kalau kamera gagal, tangan berpisah, telapak "stop" muncul dengan sopan, lalu
 * telapak terbuka menyodorkan tombol upload.
 */
export function CameraGate({ state, message, onUpload, onRetry }: { state: GateState; message: string | null; onUpload: () => void; onRetry: () => void }) {
  const root = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<{ w: number; h: number } | null>(null)
  const shown = useRef<GateState | null>(null)

  useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    const measure = () =>
      setBox((b) => {
        const w = el.offsetWidth
        const h = el.offsetHeight
        return b && b.w === w && b.h === h ? b : { w, h }
      })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const min = box ? Math.min(box.w, box.h) : 0
  const art = min * 0.62
  const artL = box ? (box.w - art) / 2 : 0
  const artT = box ? (box.h - art) / 2 - 8 : 0
  const win = { left: artL + WIN.x * art, top: artT + WIN.y * art, width: WIN.w * art, height: WIN.h * art }
  const stopSize = Math.min(170, min * 0.42)
  const cardW = box ? Math.min(170, box.w * 0.42) : 0
  const palmW = box ? Math.min(104, box.h * 0.34) : 0

  useGSAP(
    (_ctx, contextSafe) => {
      if (!box || !contextSafe) return
      const q = gsap.utils.selector(root)
      const [winEl] = q('[data-win]')
      const [tr] = q('[data-tr]')
      const [bl] = q('[data-bl]')
      const corners = q('[data-corner]')
      const [stop] = q('[data-stop]')
      const [offer] = q('[data-offer]')
      const [card] = q('[data-card]')
      const [palm] = q('[data-palm]')
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      // Hanya ukuran yang berubah (mis. bilah alamat HP muncul): langsung ke keadaan akhir, jangan diputar ulang.
      const instant = shown.current === state || reduced
      shown.current = state
      const d = (s: number) => (instant ? 0 : s)

      gsap.set(stop, { xPercent: -50, yPercent: -50, autoAlpha: 0 })
      gsap.set(offer, { autoAlpha: 0 })
      gsap.set(corners, { autoAlpha: 0 })
      gsap.set(winEl, { ...win, borderRadius: 6, boxShadow: SHADE, autoAlpha: 1 })
      gsap.set([tr, bl], { x: 0, y: 0, rotation: 0, autoAlpha: 1 })

      if (state === 'opening') {
        if (reduced) return
        if (!instant) gsap.from([tr, bl], { autoAlpha: 0, scale: 0.85, duration: 0.4, ease: 'back.out(1.6)' })
        // Jari-jari "memfokuskan": bingkai bernapas pelan.
        gsap.to(tr, { x: 3, y: -3, duration: 0.9, repeat: -1, yoyo: true, ease: 'sine.inOut' })
        gsap.to(bl, { x: -3, y: 3, duration: 0.9, repeat: -1, yoyo: true, ease: 'sine.inOut' })
        return
      }

      if (state === 'ready') {
        const to = { left: PAD, top: PAD, width: box.w - PAD * 2, height: box.h - PAD * 2 }
        const open = gsap
          .timeline()
          .to(winEl, { ...to, borderRadius: 18, duration: d(0.72), ease: 'power3.inOut' }, 0)
          .to(tr, { x: to.left + to.width - (win.left + win.width), y: to.top - win.top, duration: d(0.72), ease: 'power3.inOut' }, 0)
          .to(bl, { x: to.left - win.left, y: to.top + to.height - (win.top + win.height), duration: d(0.72), ease: 'power3.inOut' }, 0)
          .to([tr, bl], { autoAlpha: 0, duration: d(0.28) }, d(0.56))
          .to(winEl, { boxShadow: CLEAR, duration: d(0.3) }, d(0.62))
          .fromTo(corners, { autoAlpha: 0, scale: 1.4 }, { autoAlpha: 1, scale: 1, duration: d(0.3), stagger: d(0.04), ease: 'back.out(2)' }, d(0.6))
        if (instant) open.progress(1)
        return
      }

      const tl = gsap
        .timeline()
        // Bingkai bubar: tiap tangan bergeser menjauh.
        .to(tr, { x: 40, y: -36, rotation: 12, autoAlpha: 0, duration: d(0.36), ease: 'power2.in' }, 0)
        .to(bl, { x: -40, y: 36, rotation: -12, autoAlpha: 0, duration: d(0.36), ease: 'power2.in' }, 0)
        .to(winEl, { autoAlpha: 0, duration: d(0.24) }, 0)
        // ...diganti telapak "stop" yang sopan.
        .fromTo(stop, { autoAlpha: 0, scale: 0.4, x: 0, y: 24, rotation: 0 }, { autoAlpha: 1, scale: 1, y: 0, duration: d(0.44), ease: 'back.out(1.9)' }, d(0.24))
        .to(stop, { keyframes: { rotation: [-7, 5, -3, 0] }, duration: d(0.48), ease: 'sine.inOut' })
        // Lalu ia menepi dan telapak terbuka menyodorkan tombol upload, kemudian turun dari layar.
        .to(stop, { x: -box.w * 0.2, scale: 0.88, rotation: -8, duration: d(0.48), ease: 'power3.inOut' }, `+=${d(0.04)}`)
        .set(palm, { yPercent: 0, autoAlpha: 1 }, '<')
        .fromTo(offer, { autoAlpha: 0, yPercent: 60 }, { autoAlpha: 1, yPercent: 0, duration: d(0.52), ease: 'back.out(1.5)' }, `<${d(0.08)}`)
        .fromTo(card, { y: 16, rotation: 6 }, { y: 0, rotation: -3, duration: d(0.56), ease: 'back.out(2)' }, `<${d(0.12)}`)
        .to(palm, { yPercent: 110, autoAlpha: 0, duration: d(0.32), ease: 'power2.in' }, `<${d(0.28)}`)
      // Setelah tenang, kartu upload dan telapak "stop" bergoyang pelan.
      const idle = contextSafe(() => {
        gsap.to(card, { y: -5, rotation: 1, duration: 1.1, repeat: -1, yoyo: true, ease: 'sine.inOut' })
        gsap.to(stop, { rotation: -4, duration: 1.4, repeat: -1, yoyo: true, ease: 'sine.inOut' })
      })
      if (instant) tl.progress(1)
      if (reduced) return
      if (instant) idle()
      else tl.call(idle)
    },
    { scope: root, dependencies: [state, box?.w, box?.h], revertOnUpdate: true },
  )

  return (
    <div ref={root} className="pointer-events-none absolute inset-0 overflow-hidden">
      {box && (
        <>
          <div data-win className="absolute" />
          {(['top-2 left-2 border-t-4 border-l-4 rounded-tl-xl', 'top-2 right-2 border-t-4 border-r-4 rounded-tr-xl', 'bottom-2 left-2 border-b-4 border-l-4 rounded-bl-xl', 'bottom-2 right-2 border-b-4 border-r-4 rounded-br-xl'] as const).map((c) => (
            <span key={c} data-corner className={`invisible absolute size-7 border-white/85 ${c}`} />
          ))}

          <div className="absolute" style={{ left: artL, top: artT, width: art, height: art }} aria-hidden>
            <img data-tr src={FRAME} alt="" draggable={false} className="absolute inset-0 size-full" style={{ clipPath: TOP_RIGHT }} />
            <img data-bl src={FRAME} alt="" draggable={false} className="absolute inset-0 size-full" style={{ clipPath: BOTTOM_LEFT }} />
          </div>

          <div data-stop className="invisible absolute top-[60%] left-1/2" style={{ width: stopSize, height: stopSize }} aria-hidden>
            <span className="absolute inset-[8%] rounded-full border-2 border-dashed border-cream/40 bg-cream/10" />
            <img src={STOP} alt="" draggable={false} className="relative size-full" />
          </div>

          <div data-offer className="invisible absolute right-[5%] -bottom-3.5 flex flex-col items-center" style={{ width: cardW }}>
            <button
              data-card
              type="button"
              tabIndex={state === 'error' ? 0 : -1}
              onClick={onUpload}
              className="pointer-events-auto relative z-10 -mb-4 flex w-full flex-col items-center gap-0.5 rounded-2xl border-2 border-dashed border-ink bg-paper px-2 py-2 text-center text-ink shadow-hard-sm outline-none focus-visible:ring-2 focus-visible:ring-pop"
            >
              <svg viewBox="0 0 24 24" className="size-6 text-pop" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="3" y="5" width="18" height="15" rx="3" />
                <path d="M7 16l3.5-4 2.5 3 2-2 2 3" />
                <path d="M12 2.5v6M9.5 5L12 2.5 14.5 5" />
              </svg>
              <span className="text-xs leading-tight font-bold">Upload foto</span>
              <span className="text-[10px] leading-tight text-soft">bisa pilih beberapa</span>
            </button>
            <img data-palm src={OPEN_PALM} alt="" draggable={false} aria-hidden style={{ width: palmW }} />
          </div>
        </>
      )}

      {state === 'opening' && <p className="absolute inset-x-0 bottom-3 text-center text-sm text-cream/80">Membuka kamera…</p>}
      {state === 'error' && (
        <div className="absolute inset-x-0 top-0 flex flex-col items-center gap-1.5 p-3 text-center text-xs text-cream sm:text-sm" role="alert">
          <p>{message}</p>
          <button type="button" onClick={onRetry} className="pointer-events-auto rounded-full border-2 border-cream/70 px-3 py-0.5 text-xs font-bold outline-none focus-visible:ring-2 focus-visible:ring-pop">
            Coba kamera lagi
          </button>
        </div>
      )}
    </div>
  )
}
