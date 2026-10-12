import { useEffect, useRef } from 'react'
import type { Photo } from '../lib/render'

/** Thumbnail foto dipotong mengikuti rasio slot (object-fit: cover). */
export function PhotoThumb({ photo, aspect, className = '' }: { photo: Photo; aspect: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const h = 160
    const w = Math.round(h * aspect)
    c.width = w
    c.height = h
    const src = photo.img
    const k = Math.max(w / src.width, h / src.height)
    const sw = w / k
    const sh = h / k
    c.getContext('2d')!.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, w, h)
  }, [photo, aspect])
  return <canvas ref={ref} className={className} style={{ aspectRatio: aspect }} />
}
