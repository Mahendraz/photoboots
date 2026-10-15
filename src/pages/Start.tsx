import { useMemo, useRef, useState } from 'react'
import { useStepNav } from '../components/Curtain'
import { FormatPicker } from '../components/FormatPicker'
import { FramePicker } from '../components/FramePicker'
import { MiniStrip } from '../components/MiniStrip'
import { ASPECTS, FORMATS, LAYOUTS, layoutById, photoCount, type AspectId } from '../lib/layouts'
import { PATUNGAN_ACCEPT, readPatungan } from '../lib/patungan'
import { renderInput, useBooth } from '../store'

export function StartPage() {
  const stepTo = useStepNav()
  const design = useBooth((s) => s.design)
  const setLayout = useBooth((s) => s.setLayout)
  const setDesign = useBooth((s) => s.setDesign)
  const loadPatungan = useBooth((s) => s.loadPatungan)
  const fileRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const layout = layoutById(design.layoutId)
  const count = photoCount(layout, design.photoMode)

  const thumbs = useMemo(
    () =>
      LAYOUTS.map((l) => ({
        layout: l,
        input: renderInput({
          design: { ...design, layoutId: l.id, aspect: l.id === design.layoutId ? design.aspect : l.defaultAspect, overlays: [] },
          photos: [],
        }),
      })),
    // Thumbnail cukup mengikuti template & bentuk foto yang sedang dipilih.
    [design.templateId, design.templateRightId, design.layoutId, design.aspect, design.format],
  )

  async function openFile(file: File) {
    setError(null)
    try {
      const p = await readPatungan(file)
      loadPatungan(p.design, p.photos, p.from)
      stepTo('/app/foto')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 pt-6 pb-32 sm:px-6">
        <h1 className="font-heading text-3xl font-bold sm:text-4xl">Mau strip yang mana?</h1>
        <p className="mt-1 text-muted">Pilih jumlah frame dan template-nya. Stiker, filter, dan teks ditambah di langkah Hias.</p>

        <section className="mt-5">
          <h2 className="mb-2 font-heading text-lg font-bold">Mau dipakai buat apa?</h2>
          <FormatPicker value={design.format} onChange={(format) => setDesign({ format })} />
        </section>

        <div className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {thumbs.map(({ layout: l, input }) => {
            const active = l.id === design.layoutId
            return (
              <button
                key={l.id}
                onClick={() => setLayout(l.id)}
                aria-pressed={active}
                className={`group flex flex-col items-center gap-2 rounded-2xl border-2 p-2.5 text-center transition ${
                  active ? 'border-accent bg-accent-subtle shadow-md' : 'border-border bg-surface hover:border-border-strong'
                }`}
              >
                <div className="flex h-28 items-center justify-center sm:h-32">
                  <MiniStrip input={input} scale={0.07} className="h-full w-auto rounded-sm shadow-[0_2px_6px_rgba(0,0,0,0.15)]" />
                </div>
                <span className="text-sm leading-tight font-bold">{l.name}</span>
                <span className="text-xs leading-tight text-muted">{l.desc}</span>
              </button>
            )
          })}
        </div>

        <section className="mt-8 grid gap-6 sm:grid-cols-2">
          <div>
            <h2 className="font-heading text-lg font-bold">Bentuk foto</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {(Object.keys(ASPECTS) as AspectId[]).map((a) => (
                <button
                  key={a}
                  onClick={() => setDesign({ aspect: a })}
                  aria-pressed={design.aspect === a}
                  className={`flex items-center gap-2 rounded-full border-2 px-3 py-1.5 text-sm font-semibold ${
                    design.aspect === a ? 'border-accent bg-accent text-white' : 'border-border bg-surface hover:border-border-strong'
                  }`}
                >
                  <span
                    className="inline-block border-2 border-current"
                    style={{ width: 18 * Math.min(1, ASPECTS[a].ratio), height: 18 / Math.max(1, ASPECTS[a].ratio) }}
                  />
                  {ASPECTS[a].label}
                </button>
              ))}
            </div>
          </div>

          {layout.regions === 2 && (
            <div>
              <h2 className="font-heading text-lg font-bold">Strip kiri & kanan</h2>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(
                  [
                    ['kembar', 'Kembar', `${layout.rows} foto, dicetak dua kali (satu buat kamu, satu buat temanmu)`],
                    ['beda', 'Beda', `${layout.rows * 2} foto berbeda, kiri dan kanan lain isinya`],
                  ] as const
                ).map(([id, name, desc]) => (
                  <button
                    key={id}
                    onClick={() => setDesign({ photoMode: id })}
                    aria-pressed={design.photoMode === id}
                    className={`rounded-2xl border-2 p-3 text-left ${design.photoMode === id ? 'border-accent bg-accent-subtle' : 'border-border bg-surface hover:border-border-strong'}`}
                  >
                    <span className="block font-bold">{name}</span>
                    <span className="mt-0.5 block text-xs text-muted">{desc}</span>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted">Desain frame kiri dan kanan bisa dibedakan di Template frame di bawah.</p>
            </div>
          )}
        </section>

        <section className="mt-8">
          <h2 className="font-heading text-lg font-bold">Template frame</h2>
          <p className="mt-1 mb-3 text-sm text-muted">Masih bisa diganti di langkah Hias setelah fotonya kelihatan.</p>
          <FramePicker bleed="-mx-4 px-4 sm:-mx-6 sm:px-6" grid="grid-cols-4 sm:grid-cols-6 lg:grid-cols-8" />
        </section>

        <section className="mt-8 rounded-2xl border-2 border-dashed border-border-strong p-4">
          <h2 className="font-heading text-lg font-bold">Foto bareng teman dari jauh?</h2>
          <p className="mt-1 text-sm text-muted">
            Satu orang foto dulu sebagian frame, lalu kirim <b>berkas patungan</b> lewat WhatsApp. Temannya buka berkas itu di sini dan
            mengisi frame sisanya. Tanpa server, fotonya cuma lewat chat kalian.
          </p>
          <button className="btn mt-3 text-sm" onClick={() => fileRef.current?.click()}>
            Buka berkas dari teman
          </button>
          <input
            ref={fileRef}
            type="file"
            accept={PATUNGAN_ACCEPT}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) void openFile(f)
            }}
          />
          {error && <p className="mt-2 text-sm font-semibold text-danger">{error}</p>}
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-surface/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <p className="text-sm">
            <b>{layout.name}</b> · {count} foto ·{' '}
            <span className="text-muted">{design.format === 'cetak' ? layout.print : FORMATS[design.format].desc}</span>
          </p>
          <button className="btn btn-primary" onClick={(e) => stepTo('/app/foto', e)}>
            Mulai foto →
          </button>
        </div>
      </div>
    </div>
  )
}
