import { useMemo, useRef, useState } from 'react'
import { useStepNav } from '../components/Curtain'
import { FormatPicker } from '../components/FormatPicker'
import { FramePicker } from '../components/FramePicker'
import { PatunganGuide } from '../components/PatunganGuide'
import { MiniStrip } from '../components/MiniStrip'
import { ASPECTS, FORMATS, LAYOUTS, layoutById, photoCount, type AspectId } from '../lib/layouts'
import { PATUNGAN_ACCEPT, readPatungan } from '../lib/patungan'
import { templateById } from '../lib/templates'
import { leaveRoom, useRoom } from '../lib/room'
import { LinkIcon, openInvite } from '../components/Room'
import { renderInput, useBooth } from '../store'
import { useUi } from '../ui'

const LAYOUT_GROUPS = [
  { id: 'recommended', label: 'Rekomendasi', ids: ['strip-4', 'grid-4', 'polaroid'] },
  { id: 'all', label: 'Semua 11', ids: LAYOUTS.map((item) => item.id) },
  { id: 'strip', label: 'Strip', ids: ['strip-3', 'strip-4'] },
  { id: 'paired', label: 'Kiri–kanan', ids: ['double-3', 'double-4', 'double-5'] },
  { id: 'grid', label: 'Grid', ids: ['grid-4', 'grid-6', 'grid-8', 'grid-9', 'grid-10'] },
  { id: 'single', label: 'Satu foto', ids: ['polaroid'] },
] as const

type LayoutGroupId = (typeof LAYOUT_GROUPS)[number]['id']

export function StartPage() {
  const stepTo = useStepNav()
  const design = useBooth((s) => s.design)
  const setLayout = useBooth((s) => s.setLayout)
  const setDesign = useBooth((s) => s.setDesign)
  const loadPatungan = useBooth((s) => s.loadPatungan)
  const fileRef = useRef<HTMLInputElement>(null)
  const setEstafetOpen = useUi((s) => s.setEstafetOpen)
  const [layoutGroup, setLayoutGroup] = useState<LayoutGroupId>('recommended')
  const [patunganError, setPatunganError] = useState<string | null>(null)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)
  const [inviteRetryNeedsCleanup, setInviteRetryNeedsCleanup] = useState(false)
  // Di ruang foto bareng, layout diatur pembuat ruang dan ikut berubah di HP semua orang.
  const inRoomNow = useRoom((s) => s.code !== null)
  const locked = useRoom((s) => s.role === 'guest' || s.mode === 'estafet')
  const estafet = useRoom((s) => s.mode === 'estafet')
  const roomSize = useRoom((s) => s.members.filter((m) => m.online).length)
  const layout = layoutById(design.layoutId)
  const count = photoCount(layout, design.photoMode)
  const selectedTemplate = templateById(design.templateId)
  const selectedRightTemplate = design.templateRightId ? templateById(design.templateRightId) : null
  const templateSummary =
    layout.regions === 2 && selectedRightTemplate
      ? `${selectedTemplate.name} kiri · ${selectedRightTemplate.name} kanan`
      : selectedTemplate.name
  const activeGroup = LAYOUT_GROUPS.find((group) => group.id === layoutGroup) ?? LAYOUT_GROUPS[0]

  const selectedPreview = useMemo(
    () => renderInput({ design: { ...design, overlays: [] }, photos: [] }),
    [design],
  )
  const layoutsInGroup = useMemo(() => {
    const ids = new Set<string>(activeGroup.ids)
    return LAYOUTS.filter((item) => ids.has(item.id))
  }, [activeGroup])
  const visibleLayouts = useMemo(
    () => (layoutsInGroup.some((item) => item.id === layout.id) ? layoutsInGroup : [layout, ...layoutsInGroup]),
    [layout, layoutsInGroup],
  )
  const thumbs = useMemo(
    () =>
      visibleLayouts.map((item) => ({
        layout: item,
        input: renderInput({
          design: {
            ...design,
            layoutId: item.id,
            aspect: item.id === design.layoutId ? design.aspect : item.defaultAspect,
            overlays: [],
          },
          photos: [],
        }),
      })),
    [design, visibleLayouts],
  )

  async function openFile(file: File) {
    setPatunganError(null)
    try {
      const p = await readPatungan(file)
      await leaveRoom()
      loadPatungan(p.design, p.photos, p.from)
      stepTo('/app/foto')
    } catch (e) {
      setPatunganError(e instanceof Error ? e.message : 'Berkas patungan tidak bisa dibuka.')
    }
  }

  async function openLiveInvite(clientX?: number, retry = false) {
    const hadRoom = useRoom.getState().code !== null
    const resetBeforeRetry = retry && inviteRetryNeedsCleanup
    setInviteError(null)
    setOpening(true)
    try {
      if (resetBeforeRetry) await leaveRoom()
      await openInvite()
      setInviteRetryNeedsCleanup(false)
      stepTo('/app/foto', clientX === undefined ? null : { clientX })
    } catch (e) {
      setInviteRetryNeedsCleanup((!hadRoom || resetBeforeRetry) && useRoom.getState().code !== null)
      setInviteError(e instanceof Error ? e.message : 'Ruang foto bareng belum bisa disiapkan.')
    } finally {
      setOpening(false)
    }
  }

  function selectLayout(layoutId: string) {
    if (layoutId === design.layoutId) return
    if (design.overlays.length > 0 && !window.confirm('Mengganti layout akan menghapus stiker dan teks yang sudah dibuat. Lanjutkan?')) return
    setLayout(layoutId)
  }

  function choosePatunganFile() {
    fileRef.current?.click()
  }

  const formatSummary = design.format === 'cetak' ? layout.print : FORMATS[design.format].desc

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 pt-4 pb-44 sm:px-6 sm:pt-6 sm:pb-28">
        <header className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(15rem,0.8fr)] sm:items-center">
          <div>
            <p className="text-xs font-bold tracking-wide text-accent">LANGKAH 1 · LAYOUT</p>
            <h1 className="mt-1 font-heading text-3xl font-bold sm:text-4xl">Pilih strip fotomu</h1>
            <p className="mt-2 max-w-xl text-muted">
              Pilih susunan foto dulu. Ukuran, bentuk, dan template bisa disesuaikan; stiker, filter, dan teks tersedia di langkah Hias.
            </p>
          </div>
          <figure className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
            <div className="flex h-56 items-center justify-center rounded-xl bg-bg-subtle p-3">
              <div
                role="img"
                aria-label={`Pratinjau ${layout.name}, ${count} foto`}
                className="flex h-full max-w-full items-center justify-center"
              >
                <MiniStrip input={selectedPreview} fit={208} className="max-h-full max-w-full rounded-sm shadow-sm" />
              </div>
            </div>
            <figcaption className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className="font-bold">{layout.name}</span>
              <span className="text-sm text-muted">{count} foto · {formatSummary}</span>
            </figcaption>
          </figure>
        </header>

        {inRoomNow && (
          <div className="mt-5 flex flex-col gap-2 rounded-xl border border-accent/30 bg-accent-subtle p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p>
              <b>{estafet ? 'Kamu lagi ikut estafet foto.' : `Kamu lagi di ruang foto bareng (${roomSize} orang).`}</b>{' '}
              <span className="text-muted">
                {estafet
                  ? 'Layout estafet sudah ditentukan dari awal. Template tetap bisa diganti.'
                  : locked
                    ? 'Layout diatur pembuat ruang supaya frame semua orang sama. Template tetap bisa diganti.'
                    : 'Ganti layout di sini langsung berubah di HP semua orang. Foto yang sudah masuk tetap aman.'}
              </span>
            </p>
            <button type="button" className="btn shrink-0 text-sm" onClick={() => void leaveRoom()}>
              Keluar ruang
            </button>
          </div>
        )}

        <section className="mt-7" aria-labelledby="layout-heading">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="layout-heading" className="font-heading text-xl font-bold">Pilih layout</h2>
              <p className="mt-1 text-sm text-muted">Mulai dari rekomendasi atau lihat semua 11 susunan.</p>
            </div>
            <span className="text-xs font-semibold text-muted">Dipilih: {layout.name}</span>
          </div>

          <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Kategori layout">
            {LAYOUT_GROUPS.map((group) => (
              <button
                key={group.id}
                type="button"
                aria-pressed={layoutGroup === group.id}
                onClick={() => setLayoutGroup(group.id)}
                className={`min-h-10 shrink-0 rounded-full border px-3 text-sm font-semibold transition-colors ${
                  layoutGroup === group.id
                    ? 'border-accent bg-accent text-white'
                    : 'border-border bg-surface text-text hover:border-border-strong'
                }`}
              >
                {group.label}
              </button>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {thumbs.map(({ layout: item, input }) => {
              const active = item.id === design.layoutId
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectLayout(item.id)}
                  aria-pressed={active}
                  disabled={locked && !active}
                  className={`group flex min-w-0 flex-col items-center gap-2 rounded-2xl border-2 p-2 text-center transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    active ? 'border-accent bg-accent-subtle shadow-sm' : 'border-border bg-surface hover:border-border-strong'
                  }`}
                >
                  <span aria-hidden="true" className="flex h-24 w-full items-center justify-center rounded-xl bg-bg-subtle p-2 sm:h-28">
                    <MiniStrip input={input} fit={104} className="max-h-full max-w-full rounded-sm shadow-sm" />
                  </span>
                  <span className="text-sm leading-tight font-bold">{item.name}</span>
                  <span className="text-xs leading-tight text-muted">{item.desc}</span>
                  {active && <span className="text-xs font-semibold text-accent">Dipilih</span>}
                  {!active && item.id === 'strip-4' && layoutGroup === 'recommended' && (
                    <span className="text-xs font-semibold text-accent">Rekomendasi awal</span>
                  )}
                </button>
              )
            })}
          </div>

          {locked && (
            <p className="mt-3 rounded-lg bg-bg-subtle px-3 py-2 text-sm text-muted">
              Layout dikunci oleh pembuat ruang. Kamu tetap bisa melihat pilihan yang tersedia.
            </p>
          )}
        </section>

        <details className="mt-6 rounded-2xl border border-border bg-surface shadow-sm">
          <summary className="flex min-h-14 cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3 font-semibold">
            <span>Ukuran hasil & bentuk foto</span>
            <span className="text-sm font-normal text-muted">
              {FORMATS[design.format].label} · {ASPECTS[design.aspect].label}
            </span>
          </summary>
          <div className="space-y-6 border-t border-border p-4">
            <div>
              <h3 className="mb-2 font-heading text-lg font-bold">Mau dipakai buat apa?</h3>
              <FormatPicker value={design.format} onChange={(format) => setDesign({ format })} />
            </div>
            <div>
              <h3 className="font-heading text-lg font-bold">Bentuk foto</h3>
              <p className="mt-1 text-sm text-muted">Pilih bentuk tiap frame di dalam strip.</p>
              <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Bentuk foto">
                {(Object.keys(ASPECTS) as AspectId[]).map((aspect) => (
                  <button
                    key={aspect}
                    type="button"
                    onClick={() => setDesign({ aspect })}
                    aria-pressed={design.aspect === aspect}
                    className={`flex min-h-10 items-center gap-2 rounded-full border-2 px-3 py-1.5 text-sm font-semibold ${
                      design.aspect === aspect
                        ? 'border-accent bg-accent text-white'
                        : 'border-border bg-surface hover:border-border-strong'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className="inline-block border-2 border-current"
                      style={{ width: 18 * Math.min(1, ASPECTS[aspect].ratio), height: 18 / Math.max(1, ASPECTS[aspect].ratio) }}
                    />
                    {ASPECTS[aspect].label}
                  </button>
                ))}
              </div>
            </div>

            {layout.regions === 2 && (
              <div>
                <h3 className="font-heading text-lg font-bold">Strip kiri & kanan</h3>
                <p className="mt-1 text-sm text-muted">Pilih apakah kedua sisi memakai foto yang sama atau berbeda.</p>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2" role="group" aria-label="Isi strip kiri dan kanan">
                  {(
                    [
                      ['kembar', 'Kembar', `${layout.rows} foto, dicetak dua kali (satu buat kamu, satu buat temanmu)`],
                      ['beda', 'Beda', `${layout.rows * 2} foto berbeda, kiri dan kanan lain isinya`],
                    ] as const
                  ).map(([id, name, desc]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setDesign({ photoMode: id })}
                      aria-pressed={design.photoMode === id}
                      disabled={locked && design.photoMode !== id}
                      className={`rounded-2xl border-2 p-3 text-left disabled:cursor-not-allowed disabled:opacity-50 ${
                        design.photoMode === id ? 'border-accent bg-accent-subtle' : 'border-border bg-surface hover:border-border-strong'
                      }`}
                    >
                      <span className="block font-bold">{name}</span>
                      <span className="mt-0.5 block text-xs text-muted">{desc}</span>
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted">Desain frame kiri dan kanan bisa dibedakan pada template di bawah.</p>
              </div>
            )}
          </div>
        </details>

        <details className="mt-4 rounded-2xl border border-border bg-surface shadow-sm">
          <summary className="flex min-h-14 cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3 font-semibold">
            <span>Template frame</span>
            <span className="text-sm font-normal text-muted">{templateSummary}</span>
          </summary>
          <div className="border-t border-border p-4">
            <p className="mb-3 text-sm text-muted">Template bisa diganti lagi di langkah Hias setelah fotonya kelihatan.</p>
            <FramePicker bleed="-mx-4 px-4 sm:-mx-6 sm:px-6" grid="grid-cols-4 sm:grid-cols-6 lg:grid-cols-8" />
          </div>
        </details>

        <section className="mt-7 rounded-2xl border border-border bg-bg-subtle p-4 sm:p-5" aria-labelledby="collaboration-heading">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-bold tracking-wide text-accent">KOLABORASI</p>
              <h2 id="collaboration-heading" className="mt-1 font-heading text-xl font-bold">Foto bareng teman dari jauh</h2>
              <p className="mt-1 max-w-2xl text-sm text-muted">
                Mulai ruang live untuk foto bersamaan. Kalau jadwal tidak cocok, pilih estafet atau berkas patungan sebagai cadangan.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary min-h-11 shrink-0 text-sm"
              disabled={opening}
              onClick={(e) => void openLiveInvite(e.clientX)}
            >
              <LinkIcon /> {opening ? 'Menyiapkan ruang…' : inRoomNow ? 'Ajak teman lagi' : 'Ajak lewat link'}
            </button>
          </div>

          {opening && <p role="status" aria-live="polite" className="sr-only">Menyiapkan ruang foto bareng.</p>}
          {inviteError && (
            <div role="alert" className="mt-3 flex flex-col gap-2 rounded-xl border border-danger/30 bg-surface p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <p className="font-semibold text-danger">{inviteError}</p>
              <button type="button" className="btn shrink-0" onClick={() => void openLiveInvite(undefined, true)}>
                Coba lagi
              </button>
            </div>
          )}
          {patunganError && (
            <div role="alert" className="mt-3 flex flex-col gap-2 rounded-xl border border-danger/30 bg-surface p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <p className="font-semibold text-danger">{patunganError}</p>
              <button type="button" className="btn shrink-0" onClick={choosePatunganFile}>
                Pilih berkas lagi
              </button>
            </div>
          )}

          <details className="mt-4 rounded-xl border border-border bg-surface">
            <summary className="min-h-12 cursor-pointer px-3 py-3 font-semibold">
              Pilihan lain: estafet dan berkas patungan
            </summary>
            <div className="space-y-4 border-t border-border p-3">
              <div className="flex flex-col gap-3 rounded-xl border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm">
                  <b>Estafet.</b>{' '}
                  <span className="text-muted">Kamu foto dulu, lalu temanmu mengisi bagian berikutnya. Link berlaku 4 jam.</span>
                </p>
                <button type="button" className="btn shrink-0" onClick={() => setEstafetOpen(true)}>
                  Mulai estafet
                </button>
              </div>
              <div className="flex flex-col gap-3 rounded-xl border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm">
                  <b>Berkas patungan.</b>{' '}
                  <span className="text-muted">Pakai saat tidak bisa online bersamaan atau link ruang tidak tersambung.</span>
                </p>
                <button type="button" className="btn shrink-0" onClick={choosePatunganFile}>
                  Buka berkas dari teman
                </button>
              </div>
              <PatunganGuide />
            </div>
          </details>

          <input
            ref={fileRef}
            type="file"
            accept={PATUNGAN_ACCEPT}
            className="hidden"
            aria-label="Pilih berkas patungan"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void openFile(file)
            }}
          />
        </section>
      </div>

      <div
        className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:px-6"
        style={{ paddingLeft: 'max(1rem, env(safe-area-inset-left))', paddingRight: 'max(1rem, env(safe-area-inset-right))' }}
      >
        <div className="mx-auto flex max-w-5xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0 text-sm" aria-live="polite">
            <b>{layout.name}</b> · {count} foto
            <span className="block truncate text-xs text-muted">{formatSummary} · {ASPECTS[design.aspect].label}</span>
          </p>
          <button type="button" className="btn btn-primary min-h-11 w-full shrink-0 sm:w-auto" onClick={(e) => stepTo('/app/foto', e)}>
            Mulai foto →
          </button>
        </div>
      </div>
    </div>
  )
}
