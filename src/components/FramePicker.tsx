import { useMemo, useState } from 'react'
import { layoutById } from '../lib/layouts'
import { CATEGORIES, isIllustrated, TEMPLATES, type Category } from '../lib/templates'
import { renderInput, useBooth } from '../store'
import { MiniStrip } from './MiniStrip'

/**
 * Pilihan template frame. Dipakai di langkah Layout (lihat frame sebelum foto) dan di tab Frame langkah Hias
 * (ganti frame setelah fotonya terlihat). `bleed` = kelas margin negatif supaya baris kategori bisa digeser
 * sampai tepi wadahnya; `grid` = kelas kolom daftar thumbnail.
 */
export function FramePicker({
  bleed = '-mx-3 px-3',
  grid = 'grid-cols-4 sm:grid-cols-5 lg:grid-cols-4',
}: {
  bleed?: string
  grid?: string
}) {
  const { design, photos, setDesign } = useBooth()
  const [cat, setCat] = useState<Category | 'Semua' | 'Ilustrasi'>('Semua')
  const layout = layoutById(design.layoutId)
  const [side, setSide] = useState<'both' | 'left' | 'right'>(design.templateRightId ? 'left' : 'both')
  const activeId = side === 'right' ? (design.templateRightId ?? design.templateId) : design.templateId
  // Template bergambar ditampilkan lebih dulu.
  const ordered = [...TEMPLATES.filter(isIllustrated), ...TEMPLATES.filter((t) => !isIllustrated(t))]
  const list = cat === 'Semua' ? ordered : cat === 'Ilustrasi' ? ordered.filter(isIllustrated) : ordered.filter((t) => t.category === cat)

  const pick = (id: string) => {
    if (side === 'both') setDesign({ templateId: id, templateRightId: null })
    else if (side === 'left') setDesign({ templateId: id, templateRightId: design.templateRightId ?? design.templateId })
    else setDesign({ templateRightId: id })
  }

  const thumbs = useMemo(
    () =>
      list.map((t) => {
        const d = { ...design, overlays: [] }
        if (layout.regions === 2) {
          if (side === 'both') Object.assign(d, { templateId: t.id, templateRightId: null })
          else if (side === 'left') Object.assign(d, { templateId: t.id })
          else Object.assign(d, { templateRightId: t.id })
        } else d.templateId = t.id
        return { t, input: renderInput({ design: d, photos }) }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cat, side, design.layoutId, design.aspect, design.photoMode, design.filterId, design.format, photos],
  )

  return (
    <div className="space-y-3">
      {layout.regions === 2 && (
        <div className="flex rounded-full border border-border bg-surface p-0.5 text-sm font-bold">
          {(
            [
              ['both', 'Sama'],
              ['left', 'Kiri'],
              ['right', 'Kanan'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} onClick={() => setSide(id)} aria-pressed={side === id} className={`flex-1 rounded-full px-2 py-1.5 ${side === id ? 'bg-accent text-white' : ''}`}>
              {label}
            </button>
          ))}
        </div>
      )}
      <div className={`no-scrollbar flex gap-1.5 overflow-x-auto ${bleed}`}>
        {(['Semua', ...CATEGORIES] as const).map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            aria-pressed={cat === c}
            className={`shrink-0 rounded-full border-2 px-3 py-1 text-xs font-bold ${cat === c ? 'border-accent bg-accent text-white' : 'border-border'}`}
          >
            {c}
          </button>
        ))}
      </div>
      <div className={`grid gap-2 ${grid}`}>
        {thumbs.map(({ t, input: ti }) => (
          <button
            key={t.id}
            onClick={() => pick(t.id)}
            aria-pressed={activeId === t.id}
            className={`flex flex-col items-center gap-1 rounded-xl border-2 p-1.5 ${activeId === t.id ? 'border-accent bg-accent-subtle' : 'border-transparent hover:border-border'}`}
          >
            <div className="flex h-24 w-full items-center justify-center">
              <MiniStrip input={ti} fit={96} className="max-h-full max-w-full rounded-[2px] shadow-[0_1px_4px_rgba(0,0,0,0.2)]" />
            </div>
            <span className="text-[11px] leading-tight font-semibold">{t.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
