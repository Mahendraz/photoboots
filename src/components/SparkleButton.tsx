import { useRef, type ButtonHTMLAttributes, type PointerEvent } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'

gsap.registerPlugin(useGSAP)

const SPARKLE = 'https://inassetweb-cdn.inwebsite.online/sprinkles/v1/particles/sparkle.svg'
const HEART = 'https://inassetweb-cdn.inwebsite.online/sprinkles/v2/particles/sparkle-heart.webp'
const PARTS = [SPARKLE, SPARKLE, HEART, SPARKLE, SPARKLE, SPARKLE, HEART, SPARKLE]

/**
 * Tombol dari snippet Sparkle Burst Button InWebAsset: tertarik sedikit ke kursor (mouse saja),
 * mengempis saat ditekan, dan memercikkan bintang setiap `burst` bertambah (mis. berkas selesai dibuat).
 * Yang bergerak pembungkusnya, supaya efek tekan bawaan `.btn` tetap jalan.
 */
export function SparkleButton({
  burst,
  className = '',
  buttonClassName = '',
  onClick,
  ...button
}: { burst: number; className?: string; buttonClassName?: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const root = useRef<HTMLDivElement>(null)
  const lift = useRef<HTMLDivElement>(null)
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const { contextSafe } = useGSAP(
    () => {
      if (!burst || reduced()) return
      const parts = gsap.utils.toArray<HTMLElement>('[data-part]', root.current)
      gsap.fromTo(
        parts,
        { x: 0, y: 0, scale: 0, rotate: 0, autoAlpha: 1 },
        {
          x: (i) => Math.cos((i / PARTS.length) * Math.PI * 2) * gsap.utils.random(60, 90),
          y: (i) => Math.sin((i / PARTS.length) * Math.PI * 2) * gsap.utils.random(40, 64),
          scale: () => gsap.utils.random(0.55, 1),
          rotate: () => gsap.utils.random(-180, 180),
          duration: 0.7,
          ease: 'power3.out',
          overwrite: true,
        },
      )
      gsap.to(parts, { autoAlpha: 0, duration: 0.3, delay: 0.45 })
    },
    { scope: root, dependencies: [burst] },
  )

  const onPointerMove = (e: PointerEvent) =>
    contextSafe(() => {
      if (e.pointerType !== 'mouse' || reduced() || !lift.current) return
      const r = lift.current.getBoundingClientRect()
      gsap.to(lift.current, { x: (e.clientX - (r.left + r.width / 2)) * 0.12, y: (e.clientY - (r.top + r.height / 2)) * 0.2, duration: 0.4, ease: 'power3.out' })
    })()

  const onPointerLeave = () => contextSafe(() => void gsap.to(lift.current, { x: 0, y: 0, duration: 0.6, ease: 'elastic.out(1, 0.4)' }))()

  return (
    <div ref={root} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave} className={`relative ${className}`}>
      {PARTS.map((src, i) => (
        <img key={i} data-part src={src} alt="" aria-hidden className="pointer-events-none invisible absolute top-1/2 left-1/2 z-10 -mt-3 -ml-3 size-6" />
      ))}
      <div ref={lift}>
        <button
          {...button}
          className={buttonClassName}
          onClick={(e) => {
            if (!reduced()) contextSafe(() => void gsap.fromTo(lift.current, { scale: 0.92 }, { scale: 1, duration: 0.5, ease: 'back.out(3)' }))()
            onClick?.(e)
          }}
        />
      </div>
    </div>
  )
}
