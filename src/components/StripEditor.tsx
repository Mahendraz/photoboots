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

/** Kotak sentuh minimum untuk stiker kecil (px layar). */
const MIN_BOX = 44

/**
 * Pratinjau strip + lapisan untuk menggeser, memutar, dan mengubah ukuran stiker.
 * Strip dasar (tanpa stiker) dirender ulang hanya saat desain berubah; saat stiker digeser,
 * cukup stikernya yang digambar ulang di atas gambar dasar.
 *
 * Strip panjang (1:3) di layar HP jadi sempit sekali, jadi ada mode "Perbesar" yang
 * menyesuaikan lebar layar (bisa digulir) supaya stiker gampang diatur.
 */
export function StripEditor({ input, selected, onSelect, onChange, onRemove }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const baseRef = useRef<HTMLCanvasElement | null>(null)
  const [area, setArea] = useState({ w: 0, h: 0 })
  const [zoomed, setZoomed] = useState(false)
  const [, setTick] = useState(0)
  const { layout } = input
  const W = layout.width
  const H = layout.height

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const fit = () => {
      const r = el.getBoundingClientRect()
      setArea({ w: r.width, h: r.height })
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Muat seluruhnya (contain), atau selebar area saat diperbesar.
  const pad = 24
  const kFit = Math.max(0, Math.min((area.w - pad) / W, (area.h - pad) / H))
  const kWide = Math.max(0, (area.w - pad) / W)
  const canZoom = kWide > kFit * 1.35
  const kView = zoomed && canZoom ? kWide : kFit
  const box = { w: Math.floor(W * kView), h: Math.floor(H * kView) }

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
    preloadAll(baseInput, scale).then(draw)
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
    preloadAll({ ...baseInput, overlays }, scale).then(compose)
    return () => {
      alive = false
      cancelAnimationFrame(id)
    }
  })

  const k = box.w / W // px layar per satuan kanvas

  return (
    <div className="relative size-full">
      <div
        ref={wrapRef}
        className={`size-full ${zoomed && canZoom ? 'overflow-y-auto' : 'overflow-hidden'}`}
        onPointerDown={() => onSelect(null)}
      >
        <div className="flex min-h-full items-center justify-center p-3">
          <div className="relative shrink-0 shadow-[0_8px_30px_rgba(31,26,23,0.25)]" style={{ width: box.w, height: box.h }}>
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
      </div>
      {canZoom && (
        <button
          onClick={() => setZoomed((z) => !z)}
          className="btn absolute right-3 bottom-3 min-h-10 bg-paper px-3 text-sm"
          aria-pressed={zoomed}
        >
          {zoomed ? 'Muat layar' : 'Perbesar'}
        </button>
      )}
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
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ x0: number; y0: number; ox: number; oy: number; d0: number; a0: number; size0: number; rot0: number } | null>(null)

  /** Titik awal gerakan dari jari yang sedang menempel: satu jari = geser, dua jari = cubit (ukuran + putar). */
  function baseline() {
    const pts = [...pointers.current.values()]
    if (!pts.length) return (gesture.current = null)
    const [a, b] = pts
    gesture.current = {
      x0: b ? (a.x + b.x) / 2 : a.x,
      y0: b ? (a.y + b.y) / 2 : a.y,
      ox: o.x,
      oy: o.y,
      d0: b ? Math.hypot(b.x - a.x, b.y - a.y) : 0,
      a0: b ? Math.atan2(b.y - a.y, b.x - a.x) : 0,
      size0: o.size,
      rot0: o.rot,
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    e.stopPropagation()
    onSelect()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    baseline()
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const g = gesture.current
    const pts = [...pointers.current.values()]
    const [a, b] = pts
    const cx = b ? (a.x + b.x) / 2 : a.x
    const cy = b ? (a.y + b.y) / 2 : a.y
    const patch: Partial<Overlay> = {
      x: Math.min(1, Math.max(0, g.ox + (cx - g.x0) / (W * k))),
      y: Math.min(1, Math.max(0, g.oy + (cy - g.y0) / (H * k))),
    }
    if (b && g.d0 > 0) {
      patch.size = Math.min(1.6, Math.max(0.02, (g.size0 * Math.hypot(b.x - a.x, b.y - a.y)) / g.d0))
      patch.rot = snapRot(g.rot0 + ((Math.atan2(b.y - a.y, b.x - a.x) - g.a0) * 180) / Math.PI)
    }
    onChange(patch)
  }

  function onPointerEnd(e: React.PointerEvent) {
    if (!pointers.current.delete(e.pointerId)) return
    baseline()
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
      onChange({ size: Math.min(1.6, Math.max(0.02, (size0 * d) / Math.max(d0, 1))), rot: snapRot(rot0 + ((a - a0) * 180) / Math.PI) })
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

  const bw = Math.max(MIN_BOX, w * k)
  const bh = Math.max(MIN_BOX, h * k)

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      aria-label={`Stiker ${o.text ?? ''}`.trim()}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
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
      className={`absolute touch-none select-none ${selected ? 'z-10 rounded-md outline-2 outline-offset-2 outline-pop outline-dashed' : ''}`}
      style={{
        left: o.x * W * k,
        top: o.y * H * k,
        width: bw,
        height: bh,
        transform: `translate(-50%, -50%) rotate(${o.rot}deg)`,
        cursor: 'move',
      }}
    >
      {selected && (
        <>
          {/* Tombol di luar sudut kotak supaya tidak menutupi stikernya. */}
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onRemove}
            className="absolute -top-8 -left-8 grid size-7 place-items-center rounded-full border-2 border-ink bg-pop text-sm leading-none font-bold text-white"
            aria-label="Hapus stiker"
          >
            ×
          </button>
          <span
            onPointerDown={startTransform}
            className="absolute -right-8 -bottom-8 grid size-7 cursor-nwse-resize place-items-center rounded-full border-2 border-ink bg-sun"
            aria-hidden
          >
            <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
              <path d="M20 12a8 8 0 1 1-3-6.2M20 4v5h-5" />
            </svg>
          </span>
        </>
      )}
    </div>
  )
}

/** Nempel ke kelipatan 90° supaya gampang lurus lagi. */
function snapRot(rot: number) {
  const r = ((rot % 360) + 360) % 360
  for (const t of [0, 90, 180, 270, 360]) if (Math.abs(r - t) < 4) return t === 360 ? 0 : t
  return rot
}
