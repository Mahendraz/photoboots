import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { FormatPicker } from '../components/FormatPicker'
import { MiniStrip } from '../components/MiniStrip'
import { StripEditor } from '../components/StripEditor'
import { Toggle } from './Capture'
import { STICKER_PACKS } from '../data/stickers'
import { applyFilter, FILTERS } from '../lib/filters'
import { ASPECTS, layoutById, type AspectId } from '../lib/layouts'
import type { Photo } from '../lib/render'
import { CATEGORIES, FONTS, isIllustrated, TEMPLATES, templateById, type Category } from '../lib/templates'
import { renderInput, useBooth } from '../store'

type Tab = 'frame' | 'filter' | 'stiker' | 'teks' | 'atur'
const TABS: { id: Tab; label: string }[] = [
  { id: 'frame', label: 'Frame' },
  { id: 'filter', label: 'Filter' },
  { id: 'stiker', label: 'Stiker' },
  { id: 'teks', label: 'Teks' },
  { id: 'atur', label: 'Atur' },
]

const EMOJI = ['😍', '🥰', '😎', '🤪', '😜', '🥳', '😂', '🙈', '😘', '🤍', '🖤', '💖', '💕', '🫶', '✨', '⭐', '🌈', '🔥', '🎉', '📸', '🎀', '🦋', '🌸', '💐', '👑', '💋', '💯', '👻', '🐶', '🐱', '🌙', '☀️']
const COLORS = ['#1f1a17', '#ffffff', '#ff4f6d', '#ffd166', '#7bdff2', '#9be8c6', '#6741d9', '#c9a227', '#e8590c', '#1864ab']

export function EditPage() {
  const navigate = useNavigate()
  const state = useBooth()
  const { design, photos, addOverlay, updateOverlay, removeOverlay, moveOverlay } = state
  const [tab, setTab] = useState<Tab>('frame')
  const [selected, setSelected] = useState<string | null>(null)
  const input = useMemo(() => renderInput({ design, photos }), [design, photos])

  if (!photos.some(Boolean)) return <Navigate to="/app/foto" replace />

  const selectedOverlay = design.overlays.find((o) => o.id === selected) ?? null
  const place = () => ({ x: 0.3 + Math.random() * 0.4, y: 0.3 + Math.random() * 0.4, rot: Math.round(Math.random() * 20 - 10) })
  // Ukuran awal stiker relatif terhadap lebar satu strip/region, supaya di strip sempit tidak kekecilan
  // dan di grid lebar tidak kebesaran. Hasilnya pecahan dari lebar kanvas.
  const sized = (base: number) => {
    const rw = input.layout.width / input.layout.regions
    return ((rw <= 700 ? base * 1.5 : base) * rw) / input.layout.width
  }

  return (
    <div className="flex h-full flex-col lg:flex-row">
      <div className="relative min-h-0 flex-1 bg-[radial-gradient(circle_at_50%_40%,#fff_0%,#f6ead8_70%)] lg:p-4">
        <StripEditor input={input} selected={selected} onSelect={setSelected} onChange={updateOverlay} onRemove={(id) => (removeOverlay(id), setSelected(null))} />
      </div>

      <aside className="flex h-[46dvh] shrink-0 flex-col border-t-2 border-ink bg-paper lg:h-full lg:w-[400px] lg:border-t-0 lg:border-l-2">
        <nav className="no-scrollbar flex shrink-0 gap-1 overflow-x-auto border-b-2 border-ink px-2 pt-2" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`shrink-0 rounded-t-xl border-2 border-b-0 px-4 py-2 text-sm font-bold ${tab === t.id ? 'border-ink bg-sun' : 'border-transparent text-soft'}`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {selectedOverlay && (
          <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b-2 border-ink bg-sun/40 px-2 py-1.5 no-scrollbar" aria-label="Atur stiker terpilih">
            <ToolBtn label="Kecilkan" onClick={() => updateOverlay(selectedOverlay.id, { size: Math.max(0.02, selectedOverlay.size / 1.15) })}>
              −
            </ToolBtn>
            <ToolBtn label="Besarkan" onClick={() => updateOverlay(selectedOverlay.id, { size: Math.min(1.6, selectedOverlay.size * 1.15) })}>
              +
            </ToolBtn>
            <ToolBtn label="Putar kiri" onClick={() => updateOverlay(selectedOverlay.id, { rot: selectedOverlay.rot - 15 })}>
              ⟲
            </ToolBtn>
            <ToolBtn label="Putar kanan" onClick={() => updateOverlay(selectedOverlay.id, { rot: selectedOverlay.rot + 15 })}>
              ⟳
            </ToolBtn>
            <ToolBtn label="Bawa ke depan" onClick={() => moveOverlay(selectedOverlay.id, 'front')} wide>
              Ke depan
            </ToolBtn>
            <ToolBtn label="Kirim ke belakang" onClick={() => moveOverlay(selectedOverlay.id, 'back')} wide>
              Ke belakang
            </ToolBtn>
            <ToolBtn label="Hapus stiker" onClick={() => (removeOverlay(selectedOverlay.id), setSelected(null))} wide danger>
              Hapus
            </ToolBtn>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {tab === 'frame' && <FramePanel />}
          {tab === 'filter' && <FilterPanel photo={photos.find(Boolean) ?? null} />}
          {tab === 'stiker' && (
            <StickerPanel
              onEmoji={(e) => setSelected(addOverlay({ kind: 'emoji', text: e, size: sized(0.16), ...place() }))}
              onImage={(src) => setSelected(addOverlay({ kind: 'image', src, size: sized(0.2), ...place() }))}
            />
          )}
          {tab === 'teks' && (
            <TextPanel
              selectedText={selectedOverlay?.kind === 'text' ? selectedOverlay : null}
              onAdd={(text, font, color) => setSelected(addOverlay({ kind: 'text', text, font, color, size: sized(0.09), x: 0.5, y: 0.5, rot: 0 }))}
              onEdit={(patch) => selected && updateOverlay(selected, patch)}
            />
          )}
          {tab === 'atur' && <ArrangePanel />}
        </div>

        <div className="flex shrink-0 gap-2 border-t-2 border-ink p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button className="btn bg-paper px-3 text-sm" onClick={() => navigate('/app/foto')}>
            ← Foto
          </button>
          <button className="btn flex-1 bg-pop text-white" onClick={() => (setSelected(null), navigate('/app/unduh'))}>
            Selesai, unduh →
          </button>
        </div>
      </aside>
    </div>
  )
}

function FramePanel() {
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
        <div className="flex rounded-full border-2 border-ink p-0.5 text-sm font-bold">
          {(
            [
              ['both', 'Sama'],
              ['left', 'Kiri'],
              ['right', 'Kanan'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} onClick={() => setSide(id)} aria-pressed={side === id} className={`flex-1 rounded-full px-2 py-1.5 ${side === id ? 'bg-ink text-cream' : ''}`}>
              {label}
            </button>
          ))}
        </div>
      )}
      <div className="no-scrollbar -mx-3 flex gap-1.5 overflow-x-auto px-3">
        {(['Semua', ...CATEGORIES] as const).map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            aria-pressed={cat === c}
            className={`shrink-0 rounded-full border-2 px-3 py-1 text-xs font-bold ${cat === c ? 'border-ink bg-ink text-cream' : 'border-line'}`}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 lg:grid-cols-4">
        {thumbs.map(({ t, input: ti }) => (
          <button
            key={t.id}
            onClick={() => pick(t.id)}
            aria-pressed={activeId === t.id}
            className={`flex flex-col items-center gap-1 rounded-xl border-2 p-1.5 ${activeId === t.id ? 'border-ink bg-sun' : 'border-transparent hover:border-line'}`}
          >
            <div className="flex h-24 items-center">
              <MiniStrip input={ti} scale={0.06} className="h-full w-auto rounded-[2px] shadow-[0_1px_4px_rgba(0,0,0,0.2)]" />
            </div>
            <span className="text-[11px] leading-tight font-semibold">{t.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function FilterPanel({ photo }: { photo: Photo | null }) {
  const { design, setDesign } = useBooth()
  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 lg:grid-cols-4">
      {FILTERS.map((f) => (
        <button
          key={f.id}
          onClick={() => setDesign({ filterId: f.id })}
          aria-pressed={design.filterId === f.id}
          className={`flex flex-col items-center gap-1 rounded-xl border-2 p-1.5 ${design.filterId === f.id ? 'border-ink bg-sun' : 'border-transparent hover:border-line'}`}
        >
          {photo && <FilterThumb photo={photo} filterId={f.id} />}
          <span className="text-[11px] font-semibold">{f.name}</span>
        </button>
      ))}
    </div>
  )
}

function TextPanel({
  selectedText,
  onAdd,
  onEdit,
}: {
  selectedText: { text?: string; font?: string; color?: string } | null
  onAdd: (text: string, font: string, color: string) => void
  onEdit: (patch: { text?: string; font?: string; color?: string }) => void
}) {
  const { design, setDesign } = useBooth()
  const t = templateById(design.templateId)
  const [free, setFree] = useState('')
  if (selectedText) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-bold">Edit teks yang dipilih</p>
        <input
          value={selectedText.text ?? ''}
          onChange={(e) => onEdit({ text: e.target.value })}
          className="w-full rounded-xl border-2 border-ink bg-white px-3 py-2"
          maxLength={60}
          aria-label="Isi teks"
        />
        <FontPicker value={selectedText.font ?? 'Fredoka'} onChange={(font) => onEdit({ font })} />
        <ColorPicker value={selectedText.color ?? '#1f1a17'} onChange={(color) => onEdit({ color })} />
      </div>
    )
  }
  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-bold" htmlFor="footer-text">
          Tulisan di bawah strip
        </label>
        <input
          id="footer-text"
          value={design.footerText ?? ''}
          placeholder={t.text.default}
          onChange={(e) => setDesign({ footerText: e.target.value === '' ? null : e.target.value })}
          className="mt-1 w-full rounded-xl border-2 border-ink bg-white px-3 py-2"
          maxLength={40}
        />
        <div className="mt-2 flex gap-2 text-xs">
          <button className="font-semibold underline" onClick={() => setDesign({ footerText: ' ' })}>
            Kosongkan
          </button>
          <button className="font-semibold underline" onClick={() => setDesign({ footerText: null, textFont: null, textColor: null })}>
            Kembalikan bawaan template
          </button>
        </div>
      </div>
      <Toggle label="Tampilkan tanggal" checked={design.showDate} onChange={(v) => setDesign({ showDate: v })} />
      <FontPicker value={design.textFont ?? t.text.font} onChange={(f) => setDesign({ textFont: f })} />
      <ColorPicker value={design.textColor ?? t.text.color} onChange={(c) => setDesign({ textColor: c })} />
      <div className="rounded-2xl border-2 border-dashed border-line p-3">
        <p className="text-sm font-bold">Teks bebas (bisa digeser)</p>
        <div className="mt-2 flex gap-2">
          <input
            value={free}
            onChange={(e) => setFree(e.target.value)}
            placeholder="mis. Dinda & Raka"
            maxLength={60}
            className="min-w-0 flex-1 rounded-full border-2 border-ink bg-white px-3"
            aria-label="Teks bebas"
          />
          <button className="btn bg-sun text-sm" disabled={!free.trim()} onClick={() => (onAdd(free.trim(), design.textFont ?? t.text.font, design.textColor ?? t.text.color), setFree(''))}>
            Tambah
          </button>
        </div>
      </div>
    </div>
  )
}

function ArrangePanel() {
  const navigate = useNavigate()
  const { design, photos, setDesign } = useBooth()
  const layout = layoutById(design.layoutId)
  return (
    <div className="space-y-4 text-sm">
      <div>
        <p className="mb-2 font-bold">Ukuran hasil</p>
        <FormatPicker value={design.format} onChange={(format) => setDesign({ format })} />
      </div>
      <div>
        <p className="font-bold">Bentuk foto</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(Object.keys(ASPECTS) as AspectId[]).map((a) => (
            <button
              key={a}
              onClick={() => setDesign({ aspect: a })}
              aria-pressed={design.aspect === a}
              className={`rounded-full border-2 px-3 py-1.5 font-semibold ${design.aspect === a ? 'border-ink bg-ink text-cream' : 'border-line'}`}
            >
              {ASPECTS[a].label}
            </button>
          ))}
        </div>
      </div>
      {layout.regions === 2 && (
        <div>
          <p className="font-bold">Isi strip kiri & kanan</p>
          <div className="mt-2 flex gap-2">
            {(
              [
                ['kembar', 'Kembar'],
                ['beda', 'Beda'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setDesign({ photoMode: id })}
                aria-pressed={design.photoMode === id}
                className={`flex-1 rounded-full border-2 px-3 py-1.5 font-semibold ${design.photoMode === id ? 'border-ink bg-ink text-cream' : 'border-line'}`}
              >
                {label}
              </button>
            ))}
          </div>
          {design.photoMode === 'beda' && photos.some((p) => !p) && <p className="mt-2 text-xs text-soft">Mode Beda butuh foto lebih banyak. Isi frame kosong di langkah Foto.</p>}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button className="btn bg-paper text-sm" onClick={() => navigate('/app')}>
          Ganti layout
        </button>
        {design.overlays.length > 0 && (
          <button className="btn bg-paper text-sm" onClick={() => setDesign({ overlays: [] })}>
            Hapus semua stiker
          </button>
        )}
      </div>
    </div>
  )
}

function ToolBtn({ label, onClick, children, wide, danger }: { label: string; onClick: () => void; children: React.ReactNode; wide?: boolean; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`h-9 shrink-0 rounded-full border-2 border-ink text-sm font-bold ${wide ? 'px-3' : 'w-9 text-lg leading-none'} ${danger ? 'bg-pop text-white' : 'bg-paper'}`}
    >
      {children}
    </button>
  )
}

function StickerPanel({ onEmoji, onImage }: { onEmoji: (e: string) => void; onImage: (src: string) => void }) {
  const [pack, setPack] = useState(STICKER_PACKS[0].id)
  const current = STICKER_PACKS.find((p) => p.id === pack) ?? STICKER_PACKS[0]
  return (
    <div className="space-y-3">
      <div className="no-scrollbar -mx-3 flex gap-1 overflow-x-auto px-3 text-2xl">
        {EMOJI.map((e) => (
          <button key={e} onClick={() => onEmoji(e)} className="grid size-11 shrink-0 place-items-center rounded-xl hover:bg-line" aria-label={`Tambah emoji ${e}`}>
            {e}
          </button>
        ))}
      </div>
      <div className="no-scrollbar -mx-3 flex gap-1.5 overflow-x-auto px-3">
        {STICKER_PACKS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPack(p.id)}
            aria-pressed={pack === p.id}
            className={`shrink-0 rounded-full border-2 px-3 py-1 text-xs font-bold ${pack === p.id ? 'border-ink bg-ink text-cream' : 'border-line'}`}
          >
            {p.name}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-6 lg:grid-cols-5">
        {current.items.map((s) => (
          <button key={s.id} onClick={() => onImage(s.url)} className="aspect-square rounded-xl p-1 hover:bg-line" title={s.label} aria-label={`Tambah stiker ${s.label}`}>
            <img src={s.url} alt="" loading="lazy" className="size-full object-contain" />
          </button>
        ))}
      </div>
    </div>
  )
}

function FilterThumb({ photo, filterId }: { photo: Photo; filterId: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const s = 120
    c.width = s
    c.height = s
    const src = photo.img
    const side = Math.min(src.width, src.height)
    c.getContext('2d', { willReadFrequently: true })!.drawImage(src, (src.width - side) / 2, (src.height - side) / 2, side, side, 0, 0, s, s)
    applyFilter(c, FILTERS.find((f) => f.id === filterId)!)
  }, [photo, filterId])
  return <canvas ref={ref} className="aspect-square w-full rounded-lg" />
}

function FontPicker({ value, onChange }: { value: string; onChange: (f: string) => void }) {
  return (
    <div>
      <p className="text-sm font-bold">Huruf</p>
      <div className="no-scrollbar -mx-3 mt-1 flex gap-1.5 overflow-x-auto px-3">
        {FONTS.map((f) => (
          <button
            key={f}
            onClick={() => onChange(f)}
            aria-pressed={value === f}
            className={`shrink-0 rounded-xl border-2 px-3 py-1.5 text-base ${value === f ? 'border-ink bg-sun' : 'border-line'}`}
            style={{ fontFamily: `"${f}"`, fontSize: f === 'Press Start 2P' ? 10 : undefined }}
          >
            Aa {f.split(' ')[0]}
          </button>
        ))}
      </div>
    </div>
  )
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div>
      <p className="text-sm font-bold">Warna</p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        {COLORS.map((c) => (
          <button
            key={c}
            onClick={() => onChange(c)}
            aria-label={`Warna ${c}`}
            aria-pressed={value.toLowerCase() === c}
            className={`size-8 rounded-full border-2 border-ink ${value.toLowerCase() === c ? 'ring-2 ring-pop ring-offset-2' : ''}`}
            style={{ background: c }}
          />
        ))}
        <label className="relative size-8 cursor-pointer overflow-hidden rounded-full border-2 border-ink bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)]" aria-label="Warna lain">
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 opacity-0" />
        </label>
      </div>
    </div>
  )
}
