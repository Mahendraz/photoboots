import { useState } from 'react'
import { PatunganGuide } from './PatunganGuide'
import { Sheet } from './Sheet'

/** Tombol teks "Lihat caranya" yang membuka panduan patungan bergambar di lembar bawah. */
export function PatunganHelp({ className = '' }: { className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className={`min-h-11 text-sm font-semibold text-accent hover:underline ${className}`} onClick={() => setOpen(true)}>
        Lihat caranya, ada contohnya →
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Foto bareng dari jauh">
        <PatunganGuide stepsClass="" />
      </Sheet>
    </>
  )
}
