import { useRef, type RefObject } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'

gsap.registerPlugin(useGSAP)

/**
 * Pil penanda yang melar ke pilihan baru lalu memantul (gerakan Tab Pill Slider InWebAsset,
 * durasi ×0.8 supaya terasa cepat seperti aplikasi). Di dalam `root` (position: relative) harus ada
 * satu `[data-pill]` dan pilihan-pilihan `[data-item]` yang sejajar mendatar.
 */
export function useGooeyPill(root: RefObject<HTMLElement | null>, index: number, color?: (i: number) => string) {
  const current = useRef(index)
  const tl = useRef<gsap.core.Timeline | null>(null)

  // Letakkan pil di pilihan aktif, juga setiap ukuran berubah.
  useGSAP(
    () => {
      const el = root.current
      const pill = el?.querySelector<HTMLElement>('[data-pill]')
      if (!el || !pill) return
      const items = el.querySelectorAll<HTMLElement>('[data-item]')
      const place = () => {
        const t = items[current.current]
        if (!t) return gsap.set(pill, { autoAlpha: 0 })
        gsap.set(pill, { autoAlpha: 1, x: t.offsetLeft, width: t.offsetWidth, ...(color ? { backgroundColor: color(current.current) } : {}) })
      }
      place()
      const ro = new ResizeObserver(() => {
        tl.current?.progress(1)
        place()
      })
      ro.observe(el)
      return () => ro.disconnect()
    },
    { scope: root },
  )

  useGSAP(
    () => {
      const el = root.current
      const pill = el?.querySelector<HTMLElement>('[data-pill]')
      const prev = current.current
      current.current = index
      if (!el || !pill || prev === index || index < 0) return
      const items = el.querySelectorAll<HTMLElement>('[data-item]')
      const a = items[prev]
      const b = items[index]
      if (!b) return
      tl.current?.kill()
      if (!a || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        gsap.set(pill, { autoAlpha: 1, x: b.offsetLeft, width: b.offsetWidth, scaleY: 1, ...(color ? { backgroundColor: color(index) } : {}) })
        return
      }
      // Ujung depan pil melesat duluan (melar dan menipis), ujung belakang menyusul, lalu pil memantul.
      const t = gsap.timeline()
      if (index > prev) {
        t.to(pill, { width: b.offsetLeft + b.offsetWidth - a.offsetLeft, scaleY: 0.8, duration: 0.16, ease: 'power2.in' })
        t.to(pill, { x: b.offsetLeft, width: b.offsetWidth, duration: 0.48, ease: 'elastic.out(1, 0.7)' })
      } else {
        t.to(pill, { x: b.offsetLeft, width: a.offsetLeft + a.offsetWidth - b.offsetLeft, scaleY: 0.8, duration: 0.16, ease: 'power2.in' })
        t.to(pill, { width: b.offsetWidth, duration: 0.48, ease: 'elastic.out(1, 0.7)' })
      }
      t.to(pill, { scaleY: 1, duration: 0.56, ease: 'elastic.out(1.2, 0.3)' }, 0.16)
      if (color) t.to(pill, { backgroundColor: color(index), duration: 0.28, ease: 'none' }, 0)
      tl.current = t
    },
    { scope: root, dependencies: [index] },
  )
}
