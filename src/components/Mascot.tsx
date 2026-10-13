import { useImperativeHandle, useRef, type ReactNode, type Ref } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'

gsap.registerPlugin(useGSAP)

const HEART = 'https://inassetweb-cdn.inwebsite.online/sprinkles/v2/particles/sparkle-heart.webp'
const SPARK = 'https://inassetweb-cdn.inwebsite.online/sprinkles/v2/particles/sparkle-4point.webp'
const INK = '#1f1a17'
const BODY = 'M100 50C152 50 184 84 186 130C188 176 150 204 100 204C50 204 12 176 14 130C16 84 48 50 100 50Z'
const EYES = [
  { x: 72, y: 112 },
  { x: 128, y: 112 },
]
/** Seberapa jauh pupil boleh bergeser (satuan viewBox). */
const TRAVEL = 7.5

export interface MascotHandle {
  /** Tutup mata dengan kaki depan (kolom kata sandi). */
  cover: (on: boolean) => void
  /** Mata senang, melompat kecil, dan hati bermunculan. */
  happy: (on: boolean) => void
}

/** Bagian kiri yang dicerminkan ke kanan. */
const Pair = ({ children }: { children: ReactNode }) => (
  <>
    {children}
    <g transform="matrix(-1 0 0 1 200 0)">{children}</g>
  </>
)

const Paw = ({ x, side }: { x: number; side: 'l' | 'r' }) => (
  <g className={`mef-paw-${side}`}>
    <ellipse cx={x} cy={160} rx={19} ry={14} fill="currentColor" stroke={INK} strokeWidth="4" />
    <ellipse cx={x - 5} cy={154} rx={7} ry={4} fill="#fff" opacity="0.4" />
    <path d={`M${x - 7} 166v-5M${x} 167v-6M${x + 7} 166v-5`} stroke={INK} strokeOpacity="0.45" strokeWidth="2.4" strokeLinecap="round" />
  </g>
)

/**
 * Kucing yang mengintip di atas kartu masuk, dari snippet Mascot Eyes Follow InWebAsset: matanya
 * mengikuti kursor, berkedip, menutup mata saat kata sandi diketik, dan melompat senang di tombol.
 * Digambar ulang dengan garis tinta supaya serasi dengan kartu photobooth.
 */
export function Mascot({ ref, color = '#ffd166', className = '' }: { ref?: Ref<MascotHandle>; color?: string; className?: string }) {
  const root = useRef<HTMLDivElement>(null)
  const api = useRef<MascotHandle | null>(null)
  useImperativeHandle(ref, () => ({ cover: (on) => api.current?.cover(on), happy: (on) => api.current?.happy(on) }), [])

  useGSAP(
    (ctx) => {
      const el = root.current
      const svg = el?.querySelector<SVGSVGElement>('.mef-face')
      if (!el || !svg) return
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const d = reduced ? 0 : 1
      const q = gsap.utils.selector(el)

      gsap.set(q('.mef-lid'), { scaleY: 0, transformOrigin: '50% 0%' })
      gsap.set(q('.mef-happy-eye, .mef-mouth-open, .mef-mouth-shy, .mef-pop'), { autoAlpha: 0 })
      gsap.set(q('.mef-body'), { transformOrigin: '50% 100%' })
      gsap.set(q('.mef-head'), { svgOrigin: '100 200' })

      const pupils = q('.mef-pupil').map((p) => ({
        x: gsap.quickTo(p, 'x', { duration: 0.35, ease: 'power3.out' }),
        y: gsap.quickTo(p, 'y', { duration: 0.35, ease: 'power3.out' }),
      }))
      const tilt = gsap.quickTo(q('.mef-head'), 'rotation', { duration: 0.6, ease: 'power3.out' })
      const lean = gsap.quickTo(q('.mef-head'), 'x', { duration: 0.6, ease: 'power3.out' })
      let mode: 'idle' | 'cover' | 'happy' = 'idle'

      // Arahkan pupil ke titik di layar.
      const lookAt = (cx: number, cy: number) => {
        const r = svg.getBoundingClientRect()
        const k = r.width / 200
        EYES.forEach((eye, i) => {
          const dx = cx - (r.left + eye.x * k)
          const dy = cy - (r.top + eye.y * k)
          const dist = Math.hypot(dx, dy) || 1
          const m = Math.min(dist / 90, 1) * TRAVEL
          pupils[i]?.x((dx / dist) * m)
          pupils[i]?.y((dy / dist) * m)
        })
        const off = gsap.utils.clamp(-1, 1, (cx - (r.left + r.width / 2)) / 400)
        tilt(off * 6)
        lean(off * 4)
      }

      // Kedip acak, kadang dua kali. Rantainya tak berujung, jadi di luar konteks; dibersihkan manual.
      let blinkCall: gsap.core.Tween | null = null
      const blink = () => {
        if (mode === 'idle') {
          const lids = q('.mef-lid')
          const tl = gsap.timeline()
          tl.to(lids, { scaleY: 1, duration: 0.07, ease: 'power1.in' }).to(lids, { scaleY: 0, duration: 0.1, ease: 'power1.out' })
          if (Math.random() < 0.25) tl.to(lids, { scaleY: 1, duration: 0.07 }, '+=0.08').to(lids, { scaleY: 0, duration: 0.1 })
        }
        blinkCall = gsap.delayedCall(gsap.utils.random(1.8, 4.2), blink)
      }
      if (!reduced) ctx.ignore(() => (blinkCall = gsap.delayedCall(1.2, blink)))

      // Reaksi dipicu dari form kapan saja, jadi ditampung di konteks sendiri yang ikut dibersihkan.
      const reactions = gsap.context(() => {}, el)
      const react = (fn: () => void) => ctx.ignore(() => void reactions.add(fn))
      let hop: gsap.core.Timeline | null = null

      const cover = (on: boolean) =>
        react(() => {
          if (on === (mode === 'cover')) return
          if (on) happy(false)
          mode = on ? 'cover' : 'idle'
          const ease = on ? 'back.out(1.8)' : 'power3.out'
          gsap.to(q('.mef-paw-l'), { x: on ? 12 : 0, y: on ? -44 : 0, rotation: on ? 28 : 0, scale: on ? 1.22 : 1, svgOrigin: '62 160', duration: 0.5 * d, ease, overwrite: 'auto' })
          gsap.to(q('.mef-paw-r'), { x: on ? -12 : 0, y: on ? -44 : 0, rotation: on ? -28 : 0, scale: on ? 1.22 : 1, svgOrigin: '138 160', duration: 0.5 * d, delay: on ? 0.06 * d : 0, ease, overwrite: 'auto' })
          gsap.to(q('.mef-mouth'), { autoAlpha: on ? 0 : 1, duration: 0.15 * d })
          gsap.to(q('.mef-mouth-shy'), { autoAlpha: on ? 1 : 0, duration: 0.15 * d })
          gsap.to(q('.mef-cheek'), { opacity: on ? 0.95 : 0.55, scale: on ? 1.25 : 1, transformOrigin: '50% 50%', duration: 0.3 * d })
          gsap.to(q('.mef-head'), { y: on ? 4 : 0, duration: 0.4 * d, ease: 'power2.out' })
        })

      const happy = (on: boolean) =>
        react(() => {
          if (on === (mode === 'happy')) return
          if (on) cover(false)
          mode = on ? 'happy' : 'idle'
          gsap.to(q('.mef-eye'), { autoAlpha: on ? 0 : 1, duration: 0.12 * d })
          gsap.to(q('.mef-happy-eye'), { autoAlpha: on ? 1 : 0, duration: 0.12 * d })
          gsap.to(q('.mef-mouth'), { autoAlpha: on ? 0 : 1, duration: 0.12 * d })
          gsap.to(q('.mef-mouth-open'), { autoAlpha: on ? 1 : 0, duration: 0.12 * d })
          hop?.kill()
          if (on && !reduced) {
            hop = gsap
              .timeline({ repeat: -1, repeatDelay: 0.15 })
              .to(q('.mef-body'), { y: -16, scaleY: 1.06, scaleX: 0.96, duration: 0.2, ease: 'power2.out' })
              .to(q('.mef-body'), { y: 0, scaleY: 1, scaleX: 1, duration: 0.26, ease: 'power2.in' })
              .to(q('.mef-body'), { scaleY: 0.9, scaleX: 1.07, duration: 0.08, ease: 'power1.out' })
              .to(q('.mef-body'), { scaleY: 1, scaleX: 1, duration: 0.3, ease: 'elastic.out(1, 0.4)' })
            gsap.fromTo(
              q('.mef-pop'),
              { autoAlpha: 1, scale: 0.2, y: 10, x: 0, rotation: 0 },
              {
                scale: 1,
                y: (i) => [-34, -48, -30][i % 3],
                x: (i) => [-22, 4, 26][i % 3],
                rotation: (i) => [-20, 8, 22][i % 3],
                duration: 0.6,
                stagger: 0.08,
                ease: 'back.out(2)',
              },
            )
            gsap.to(q('.mef-pop'), { autoAlpha: 0, duration: 0.3, delay: 0.9, stagger: 0.08 })
          } else gsap.to(q('.mef-body'), { y: 0, scaleX: 1, scaleY: 1, duration: 0.3 })
        })
      api.current = { cover, happy }

      const onMove = (e: PointerEvent) => !reduced && lookAt(e.clientX, e.clientY)
      window.addEventListener('pointermove', onMove)
      return () => {
        window.removeEventListener('pointermove', onMove)
        blinkCall?.kill()
        hop?.kill()
        reactions.revert()
        api.current = null
      }
    },
    { scope: root },
  )

  return (
    <div ref={root} className={`pointer-events-none absolute inset-x-0 top-0 ${className}`} style={{ color }} aria-hidden>
      <svg viewBox="0 0 200 200" className="mef-face absolute top-0 left-1/2 z-0 -ml-[65px] w-[130px] overflow-visible">
        <g className="mef-body">
          <g className="mef-head">
            <Pair>
              <path d="M34 100C34 72 40 48 50 34C64 42 82 54 94 66Z" fill="currentColor" stroke={INK} strokeWidth="4" strokeLinejoin="round" />
              <path d="M48 86C48 70 51 58 56 50C64 55 73 61 80 68Z" fill="#ff8fb1" opacity="0.55" />
            </Pair>
            <path d={BODY} fill="currentColor" stroke={INK} strokeWidth="4" />
            <ellipse cx="70" cy="80" rx="26" ry="14" fill="#fff" opacity="0.32" transform="rotate(-24 70 80)" />
            <Pair>
              <path d="M42 128L18 122M42 137L16 139" stroke={INK} strokeOpacity="0.55" strokeWidth="2.4" strokeLinecap="round" />
            </Pair>
            <path d="M94 128H106L100 134Z" fill="#ff8fb1" stroke={INK} strokeWidth="1.5" strokeLinejoin="round" />
            <ellipse className="mef-cheek" cx="50" cy="136" rx="13" ry="8" fill="#ff8fb1" opacity="0.55" />
            <ellipse className="mef-cheek" cx="150" cy="136" rx="13" ry="8" fill="#ff8fb1" opacity="0.55" />
            {EYES.map((e, i) => (
              <g key={i}>
                <g className="mef-eye">
                  <ellipse cx={e.x} cy={e.y} rx="17" ry="19" fill="#fff" stroke={INK} strokeWidth="3" />
                  <g className="mef-pupil">
                    <circle cx={e.x} cy={e.y} r="9.5" fill={INK} />
                    <circle cx={e.x - 3} cy={e.y - 4} r="3.2" fill="#fff" />
                  </g>
                  <clipPath id={`mef-clip-${i}`}>
                    <ellipse cx={e.x} cy={e.y} rx="17.5" ry="19.5" />
                  </clipPath>
                  <rect className="mef-lid" x={e.x - 20} y={e.y - 21} width="40" height="42" fill="currentColor" clipPath={`url(#mef-clip-${i})`} />
                </g>
                <path className="mef-happy-eye" d={`M${e.x - 12} ${e.y + 4}Q${e.x} ${e.y - 12} ${e.x + 12} ${e.y + 4}`} stroke={INK} strokeWidth="5" strokeLinecap="round" fill="none" />
              </g>
            ))}
            <path className="mef-mouth" d="M91 140Q100 149 109 140" stroke={INK} strokeWidth="4" strokeLinecap="round" fill="none" />
            <g className="mef-mouth-open">
              <path d="M86 136Q100 162 114 136Z" fill={INK} />
              <path d="M93 148Q100 141 107 148Q100 156 93 148Z" fill="#ff7a9a" />
            </g>
            <path className="mef-mouth-shy" d="M90 143q5-5 10 0t10 0" stroke={INK} strokeWidth="3.5" strokeLinecap="round" fill="none" />
          </g>
        </g>
      </svg>

      <div className="absolute top-6 left-1/2 z-30 size-0">
        <img src={HEART} alt="" className="mef-pop invisible absolute -top-4 -left-4 size-8 max-w-none" />
        <img src={SPARK} alt="" className="mef-pop invisible absolute -top-3 -left-3 size-6 max-w-none" />
        <img src={HEART} alt="" className="mef-pop invisible absolute -top-3.5 -left-3.5 size-7 max-w-none" />
      </div>

      {/* Kaki depan bertumpu di tepi kartu, di depannya. */}
      <svg viewBox="0 0 200 200" className="absolute top-0 left-1/2 z-20 -ml-[65px] w-[130px] overflow-visible">
        <Paw x={62} side="l" />
        <Paw x={138} side="r" />
      </svg>
    </div>
  )
}
