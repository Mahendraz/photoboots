import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { composeOverlays, overlayBox, preloadAll, renderStrip, waitFonts, type Overlay, type RenderInput } from '../lib/render'
import { FONTS } from '../lib/templates'

interface Props {
  input: RenderInput
  selected: string | null
  onSelect: (id: string | null) => void
  onChange: (id: string, patch: Partial<Overlay>) => void
  onRemove: (id: string) => void
}

/**
 * Pratinjau strip + lapisan untuk menggeser, memutar, dan mengubah ukuran stiker.
 * Strip dasar (tanpa stiker) dirender ulang hanya saat desain berubah; saat stiker digeser,
 * cukup stikernya yang digambar ulang di atas gambar dasar.
 */
export function StripEditor({ input, selected, onSelect, onChange, onRemove }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const baseRef = useRef<HTMLCanvasElement | null>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  const [, setTick] = useState(0)
  const { layout } = input
  const W = layout.width
  const H = layout.height

  // Ukuran tampilan: muat di dalam area yang tersedia (contain).
  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const fit = () => {
      const r = el.getBoundingClientRect()
      const k = Math.min(r.width / W, r.height / H)
      setBox({ w: Math.floor(W * k), h: Math.floor(H * k) })
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [W, H])

  const scale = Math.min(1, (box.w * Math.min(window.devicePixelRatio || 1, 2)) / W)
  const { overlays } = input
  const tplKey = input.templates.map((t) => t.id).join('|')
  const baseInput = useMemo(
    () => ({ ...input, overlays: [] as Overlay[] }),
    // Hanya bagian yang memengaruhi strip dasar; perubahan stiker tidak memicu render dasar ulang.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [input.layout, input.aspect, input.photoMode, tplKey, input.filter, input.photos, input.footerText, input.showDate, input.textFont, input.textColor],
  )

  // Render dasar
  useEffect(() => {
    if (!box.w) return
    let alive = true
    const draw = () => {
      if (!alive) return
      baseRef.current ??= document.createElement('canvas')
      renderStrip(baseRef.current, baseInput, { scale, placeholders: true, skipOverlays: true })
      setTick((t) => t + 1)
    }
    draw()
    preloadAll(baseInput).then(draw)
    waitFonts(FONTS).then(draw)
    return () => {
      alive = false
    }
  }, [baseInput, scale, box.w])

  // Gabungkan stiker
  useEffect(() => {
    let alive = true
    const compose = () => {
      if (alive && baseRef.current && canvasRef.current) composeOverlays(canvasRef.current, baseRef.current, { ...baseInput, overlays }, scale)
    }
    const id = requestAnimationFrame(compose)
    preloadAll({ ...baseInput, overlays }).then(compose)
    return () => {
      alive = false
      cancelAnimationFrame(id)
    }
  })

  const k = box.w / W // px layar per satuan kanvas

  return (
    <div ref={wrapRef} className="relative flex size-full items-center justify-center" onPointerDown={() => onSelect(null)}>
      <div className="relative shadow-[0_8px_30px_rgba(31,26,23,0.25)]" style={{ width: box.w, height: box.h }}>
        <canvas ref={canvasRef} className="block size-full" />
        {overlays.map((o) => (
          <OverlayBox
            key={o.id}
            o={o}
            k={k}
            W={W}
            H={H}
            selected={o.id === selected}
            onSelect={() => onSelect(o.id)}
            onChange={(p) => onChange(o.id, p)}
            onRemove={() => onRemove(o.id)}
          />
        ))}
      </div>
    </div>
  )
}

function OverlayBox({
  o,
  k,
  W,
  H,
  selected,
  onSelect,
  onChange,
  onRemove,
}: {
  o: Overlay
  k: number
  W: number
  H: number
  selected: boolean
  onSelect: () => void
  onChange: (p: Partial<Overlay>) => void
  onRemove: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const { w, h } = overlayBox(o, W)

  function startDrag(e: React.PointerEvent) {
    e.stopPropagation()
    onSelect()
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    const sx = e.clientX
    const sy = e.clientY
    const ox = o.x
    const oy = o.y
    const move = (ev: PointerEvent) => {
      onChange({
        x: Math.min(1, Math.max(0, ox + (ev.clientX - sx) / (W * k))),
        y: Math.min(1, Math.max(0, oy + (ev.clientY - sy) / (H * k))),
      })
    }
    const up = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  }

  function startTransform(e: React.PointerEvent) {
    e.stopPropagation()
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    const parent = ref.current!.parentElement!.getBoundingClientRect()
    const cx = parent.left + o.x * W * k
    const cy = parent.top + o.y * H * k
    const d0 = Math.hypot(e.clientX - cx, e.clientY - cy)
    const a0 = Math.atan2(e.clientY - cy, e.clientX - cx)
    const size0 = o.size
    const rot0 = o.rot
    const move = (ev: PointerEvent) => {
      const d = Math.hypot(ev.clientX - cx, ev.clientY - cy)
      const a = Math.atan2(ev.clientY - cy, ev.clientX - cx)
      let rot = rot0 + ((a - a0) * 180) / Math.PI
      // Nempel ke 0° supaya gampang lurus lagi
      const norm = ((rot % 360) + 360) % 360
      if (norm < 4 || norm > 356) rot = 0
      onChange({ size: Math.min(1.6, Math.max(0.02, (size0 * d) / Math.max(d0, 1))), rot })
    }
    const up = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  }

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      aria-label={`Stiker ${o.text ?? ''}`.trim()}
      onPointerDown={startDrag}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 0.05 : 0.01
        if (e.key === 'Delete' || e.key === 'Backspace') onRemove()
        else if (e.key === 'ArrowLeft') onChange({ x: o.x - step })
        else if (e.key === 'ArrowRight') onChange({ x: o.x + step })
        else if (e.key === 'ArrowUp') onChange({ y: o.y - step })
        else if (e.key === 'ArrowDown') onChange({ y: o.y + step })
        else return
        e.preventDefault()
      }}
      className={`absolute touch-none select-none ${selected ? 'outline-2 outline-pop outline-dashed' : ''}`}
      style={{
        left: o.x * W * k,
        top: o.y * H * k,
        width: Math.max(28, w * k),
        height: Math.max(28, h * k),
        transform: `translate(-50%, -50%) rotate(${o.rot}deg)`,
        cursor: 'move',
      }}
    >
      {selected && (
        <>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onRemove}
            className="absolute -top-4 -right-4 grid size-8 place-items-center rounded-full border-2 border-ink bg-pop text-sm font-bold text-white"
            aria-label="Hapus stiker"
          >
            ×
          </button>
          <span
            onPointerDown={startTransform}
            className="absolute -right-4 -bottom-4 grid size-8 cursor-nwse-resize place-items-center rounded-full border-2 border-ink bg-sun"
            aria-hidden
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
              <path d="M20 12a8 8 0 1 1-3-6.2M20 4v5h-5" />
            </svg>
          </span>
        </>
      )}
    </div>
  )
}
