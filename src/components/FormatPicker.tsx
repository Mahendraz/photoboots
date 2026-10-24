import { FORMAT_IDS, FORMATS, type FormatId } from '../lib/layouts'

/** Ikon bentuk kanvas per format (cetak digambar sebagai strip). */
const SHAPE: Record<FormatId, [number, number]> = { cetak: [8, 22], story: [13, 22], feed: [17, 21], square: [20, 20] }

export function FormatPicker({ value, onChange }: { value: FormatId; onChange: (f: FormatId) => void }) {
  // Jumlah kolom ikut lebar wadah, bukan lebar layar: di panel samping editor (400px) empat kolom
  // terlalu sempit sampai teksnya keluar kartu, padahal layarnya lebar.
  return (
    <div className="@container">
      <div className="grid grid-cols-2 gap-2 @3xl:grid-cols-4" role="radiogroup" aria-label="Ukuran hasil">
        {FORMAT_IDS.map((id, index) => {
          const f = FORMATS[id]
          const [w, h] = SHAPE[id]
          const active = value === id
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(id)}
              onKeyDown={(e) => {
                const next = e.key === 'ArrowRight' || e.key === 'ArrowDown'
                  ? (index + 1) % FORMAT_IDS.length
                  : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
                    ? (index - 1 + FORMAT_IDS.length) % FORMAT_IDS.length
                    : e.key === 'Home'
                      ? 0
                      : e.key === 'End'
                        ? FORMAT_IDS.length - 1
                        : index
                if (next === index) return
                e.preventDefault()
                onChange(FORMAT_IDS[next])
                e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus()
              }}
              className={`flex min-w-0 items-center gap-3 rounded-2xl border-2 p-2.5 text-left ${active ? 'border-accent bg-accent-subtle' : 'border-border bg-surface hover:border-border-strong'}`}
            >
              <span className="grid size-7 shrink-0 place-items-center">
                <span className="block rounded-[3px] border-2 border-current" style={{ width: w, height: h }} />
              </span>
              <span className="min-w-0 break-words">
                <span className="block text-sm leading-tight font-bold">{f.label}</span>
                <span className="block text-xs leading-tight text-muted">{f.desc}</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
