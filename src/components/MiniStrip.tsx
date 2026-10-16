import { useEffect, useRef } from 'react'
import { preloadAll, renderStrip, type RenderInput } from '../lib/render'

/**
 * Pratinjau kecil strip (thumbnail layout / template / filter).
 *
 * `fit` = panjang sisi terpanjang thumbnail dalam px layar. Kanvas dirender setajam itu (× DPR) lalu cukup diberi
 * `max-h-full max-w-full`: elemen pengganti dengan lebar/tinggi auto menyusut sambil menjaga rasio, jadi strip
 * tinggi (1:3) maupun format lebar (Kotak 1:1, Feed 4:5) selalu muat di kotaknya. Tanpa `fit`, pakai `scale`.
 */
export function MiniStrip({
  input,
  scale: fixedScale,
  fit,
  className = '',
  placeholders = true,
}: { input: RenderInput; scale?: number; fit?: number; className?: string; placeholders?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const { width: W, height: H } = input.layout
  const scale = fit ? (fit * Math.min(window.devicePixelRatio || 1, 2)) / Math.max(W, H) : (fixedScale ?? 0.06)

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
