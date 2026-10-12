import { useEffect, useRef } from 'react'
import { preloadAll, renderStrip, type RenderInput } from '../lib/render'

/** Pratinjau kecil strip (thumbnail layout / template / filter). */
export function MiniStrip({ input, scale, className = '', placeholders = true }: { input: RenderInput; scale: number; className?: string; placeholders?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    let alive = true
    const draw = () => ref.current && renderStrip(ref.current, input, { scale, placeholders })
    // Tunda sedikit supaya banyak thumbnail tidak memblokir satu frame sekaligus.
    const id = requestAnimationFrame(draw)
    preloadAll(input, scale).then(() => alive && draw())
    document.fonts?.ready.then(() => alive && draw())
    return () => {
      alive = false
      cancelAnimationFrame(id)
    }
  }, [input, scale, placeholders])

  return <canvas ref={ref} className={className} style={{ aspectRatio: `${input.layout.width} / ${input.layout.height}` }} />
}
