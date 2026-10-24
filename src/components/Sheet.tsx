import { useEffect, useId, useRef, type ReactNode } from 'react'

/** Lembar bawah di HP, dialog di tengah di layar lebar. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  const titleId = useId()
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const dialog = dialogRef.current
    const focusable = () =>
      [...(dialog?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])]
        .filter((el) => el.tabIndex >= 0 && el.getClientRects().length > 0 && !el.closest('[hidden], [aria-hidden="true"]'))
    const items = focusable()
    ;(items[0] ?? dialog)?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const current = focusable()
      if (!current.length) {
        e.preventDefault()
        dialog?.focus()
        return
      }
      const first = current[0]
      const last = current[current.length - 1]
      if (!dialog?.contains(document.activeElement)) {
        e.preventDefault()
        ;(e.shiftKey ? last : first).focus()
        return
      }
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      previous?.focus()
    }
  }, [open])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="anim-rise card max-h-[90dvh] w-full overflow-y-auto rounded-b-none p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:max-w-md sm:rounded-b-[1.25rem]"
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 id={titleId} className="font-heading text-xl font-bold">{title}</h2>
          <button onClick={onClose} className="grid size-11 place-items-center rounded-full border border-border text-lg font-bold" aria-label="Tutup">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
