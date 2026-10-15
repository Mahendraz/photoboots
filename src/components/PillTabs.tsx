import { useId, useRef, type KeyboardEvent, type RefObject } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { useGooeyPill } from '../lib/gooey'

gsap.registerPlugin(useGSAP)

export interface PillTab<T extends string> {
  id: T
  label: string
  /** Ikon clay dari InWebAsset. */
  icon: string
  /** Warna pil saat tab ini aktif (hex, supaya bisa dianimasikan). */
  color: string
  /** Warna tulisan di atas pil. */
  ink: string
}

/**
 * Tab dari snippet Tab Pill Slider InWebAsset: pil melar ke tab yang dipilih lalu memantul, ikon tab
 * baru meloncat, dan isi panel bergeser masuk dari arah perpindahan. Gaya pilnya mengikuti design
 * system InWebsite (pil --accent-subtle, tanpa garis).
 */
export function PillTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  panel,
}: {
  tabs: PillTab<T>[]
  value: T
  onChange: (id: T) => void
  label: string
  /** Isi panel yang digeser masuk saat tab berganti. */
  panel?: RefObject<HTMLElement | null>
}) {
  const root = useRef<HTMLDivElement>(null)
  const uid = useId()
  const index = tabs.findIndex((t) => t.id === value)
  const prev = useRef(index)
  useGooeyPill(root, index, (i) => tabs[i].color)

  useGSAP(
    () => {
      const from = prev.current
      prev.current = index
      if (from === index || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
      const dir = index > from ? 1 : -1
      const icon = root.current?.querySelectorAll('[data-icon]')[index]
      if (icon) {
        gsap.killTweensOf(icon)
        gsap
          .timeline()
          .to(icon, { y: -8, scale: 1.3, rotation: -12 * dir, duration: 0.14, ease: 'power2.out' }, 0.1)
          .to(icon, { y: 0, scale: 1, rotation: 0, duration: 0.64, ease: 'elastic.out(1.1, 0.35)' })
      }
      if (panel?.current) gsap.fromTo(panel.current, { x: dir * 28, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 0.4, delay: 0.06, ease: 'power3.out' })
    },
    { scope: root, dependencies: [index] },
  )

  // Fokus berpindah dengan panah, Home, dan End (pola tablist).
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, number> = {
      ArrowRight: (index + 1) % tabs.length,
      ArrowLeft: (index - 1 + tabs.length) % tabs.length,
      Home: 0,
      End: tabs.length - 1,
    }
    if (!(e.key in keys)) return
    e.preventDefault()
    const next = keys[e.key]
    onChange(tabs[next].id)
    e.currentTarget.querySelectorAll<HTMLButtonElement>('[role=tab]')[next]?.focus()
  }

  return (
    <div ref={root} role="tablist" aria-label={label} onKeyDown={onKeyDown} className="relative flex shrink-0 gap-1 border-b border-border p-1.5">
      <span data-pill aria-hidden className="invisible absolute top-1.5 bottom-1.5 left-0 rounded-xl" />
      {tabs.map((t, i) => (
        <button
          key={t.id}
          data-item
          type="button"
          role="tab"
          id={`${uid}-${t.id}`}
          aria-selected={i === index}
          tabIndex={i === index ? 0 : -1}
          onClick={() => onChange(t.id)}
          className="relative z-10 flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-1 text-[11px] font-bold outline-none focus-visible:ring-2 focus-visible:ring-accent sm:text-xs"
          style={{ color: i === index ? t.ink : 'var(--color-muted)', transition: 'color 0.2s' }}
        >
          <img data-icon src={t.icon} alt="" draggable={false} className="size-6" />
          {t.label}
        </button>
      ))}
    </div>
  )
}
