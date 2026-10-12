import { useEffect, type ReactNode } from 'react'

/** Lembar bawah di HP, dialog di tengah di layar lebar. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="anim-rise card max-h-[90dvh] w-full overflow-y-auto rounded-b-none p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:max-w-md sm:rounded-b-[1.25rem]"
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="font-display text-xl font-bold">{title}</h2>
          <button onClick={onClose} className="grid size-9 place-items-center rounded-full border-2 border-ink text-lg font-bold" aria-label="Tutup">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
