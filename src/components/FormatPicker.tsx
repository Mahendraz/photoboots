import { FORMAT_IDS, FORMATS, type FormatId } from '../lib/layouts'

/** Ikon bentuk kanvas per format (cetak digambar sebagai strip). */
const SHAPE: Record<FormatId, [number, number]> = { cetak: [8, 22], story: [13, 22], feed: [17, 21], square: [20, 20] }

export function FormatPicker({ value, onChange }: { value: FormatId; onChange: (f: FormatId) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Ukuran hasil">
      {FORMAT_IDS.map((id) => {
        const f = FORMATS[id]
        const [w, h] = SHAPE[id]
        const active = value === id
        return (
          <button
            key={id}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(id)}
            className={`flex items-center gap-3 rounded-2xl border-2 p-2.5 text-left ${active ? 'border-ink bg-sky/50 shadow-hard-sm' : 'border-line bg-paper hover:border-ink'}`}
          >
            <span className="grid size-7 shrink-0 place-items-center">
              <span className="block rounded-[3px] border-2 border-current" style={{ width: w, height: h }} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm leading-tight font-bold">{f.label}</span>
              <span className="block text-xs leading-tight text-soft">{f.desc}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
