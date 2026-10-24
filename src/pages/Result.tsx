import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { useStepNav } from '../components/Curtain'
import { MiniStrip } from '../components/MiniStrip'
import { RoomCard } from '../components/Room'
import { QuotaBar } from '../components/LoginSheet'
import { SparkleButton } from '../components/SparkleButton'
import { loginPath, useAuth } from '../lib/api'
import { downloadBlob, fileName, hasLive, renderBlob, renderGif, type Format } from '../lib/export'
import { leaveRoom } from '../lib/room'
import { useGooeyPill } from '../lib/gooey'
import { FORMAT_IDS, FORMATS, type FormatId } from '../lib/layouts'
import { renderInput, useBooth } from '../store'

const SHORT: Record<FormatId, string> = { cetak: 'Cetak', story: 'Story/TikTok', feed: 'Feed', square: 'Kotak' }

type Busy = 'png' | 'jpg' | 'gif' | 'share' | null

export function ResultPage() {
  const navigate = useNavigate()
  const stepTo = useStepNav()
  const { design, photos, stripId, resetPhotos, setDesign } = useBooth()
  const { user, quota, claimStrip } = useAuth()
  const input = useMemo(() => renderInput({ design, photos }), [design, photos])
  const [hd, setHd] = useState(false)
  const [busy, setBusy] = useState<Busy>(null)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [claimed, setClaimed] = useState<Record<string, boolean>>({})
  const [last, setLast] = useState<Blob | null>(null)
  // Bertambah setiap berkas selesai dibuat; memicu percikan di tombolnya.
  const [done, setDone] = useState({ jpg: 0, png: 0, gif: 0 })
  const formatRef = useRef<HTMLDivElement>(null)
  useGooeyPill(formatRef, FORMAT_IDS.indexOf(design.format))
  const boxRef = useRef<HTMLDivElement>(null)
  const [previewScale, setPreviewScale] = useState(0.3)

  useEffect(() => {
    setLast(null)
  }, [input, hd])

  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    const fit = () => {
      const r = el.getBoundingClientRect()
      const k = Math.min(r.width / input.layout.width, r.height / input.layout.height)
      setPreviewScale(Math.min(1, k * Math.min(window.devicePixelRatio || 1, 2)))
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [input.layout])

  if (!photos.some(Boolean)) return <Navigate to="/app/foto" replace />

  const willWatermark = stripId in claimed ? claimed[stripId] : !!user && quota.used >= quota.limit
  const live = hasLive(input)
  const empty = photos.filter((p) => !p).length

  async function save(kind: 'png' | 'jpg' | 'gif') {
    if (!user) return navigate(loginPath('/app/unduh'))
    setError(null)
    setBusy(kind)
    setProgress(0)
    try {
      // Selesaikan render lokal sebelum meminta kuota agar kegagalan render tidak menghabiskan jatah.
      const predictedWatermark = stripId in claimed ? claimed[stripId] : willWatermark
      const render = (watermark: boolean) =>
        kind === 'gif'
          ? renderGif(input, { watermark, onProgress: setProgress })
          : renderBlob(input, { scale: k, watermark, format: kind as Format })
      // Render dahulu supaya kegagalan kanvas/GIF tidak memakai jatah. Bila kuota berubah
      // di tab lain saat proses, render ulang dengan keputusan server yang sebenarnya.
      let blob: Blob = await render(predictedWatermark)
      const finalWatermark = stripId in claimed ? claimed[stripId] : await claimStrip(stripId)
      if (finalWatermark !== predictedWatermark) blob = await render(finalWatermark)
      setClaimed((c) => ({ ...c, [stripId]: finalWatermark }))
      setLast(blob)
      downloadBlob(blob, fileName(kind))
      setDone((d) => ({ ...d, [kind]: d[kind] + 1 }))
    } catch (e) {
      const err = e as Error & { status?: number }
      if (err.status === 401) navigate(loginPath('/app/unduh'))
      else setError(err.message || 'Gagal membuat gambar.')
    } finally {
      setBusy(null)
    }
  }

  async function share() {
    if (!last) return
    setBusy('share')
    try {
      const ext = last.type === 'image/gif' ? 'gif' : last.type === 'image/png' ? 'png' : 'jpg'
      await navigator.share({ files: [new File([last], fileName(ext), { type: last.type })] })
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError('Gagal membagikan berkas. Coba unduh lalu bagikan dari perangkat ini.')
    } finally {
      setBusy(null)
    }
  }

  const canShare = !!last && typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([last], 'x.png', { type: last.type })] })
  const k = design.format === 'cetak' && hd ? 2 : 1
  const px = `${input.layout.width * k}×${input.layout.height * k}`

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col gap-4 overflow-y-auto p-4 pb-24 lg:flex-row lg:p-6">
      <div ref={boxRef} role="img" aria-label="Pratinjau strip foto" className="flex min-h-[45dvh] flex-1 items-center justify-center lg:min-h-0">
        <MiniStrip input={input} scale={previewScale} placeholders={false} className="max-h-full max-w-full shadow-[0_10px_30px_rgba(20,24,31,0.3)]" />
      </div>

      <aside className="flex flex-col gap-4 lg:w-96">
        <div className="card space-y-4 p-4">
          <h1 className="font-heading text-2xl font-bold">Strip-mu sudah jadi!</h1>
          {user ? (
            <QuotaBar used={quota.used} limit={quota.limit} />
          ) : (
            <p className="text-sm text-muted">Masuk dulu untuk mengunduh. Gratis {quota.limit} strip per hari tanpa watermark.</p>
          )}
          {willWatermark && (
            <p className="rounded-xl bg-warning-subtle p-3 text-sm text-warning">
              Jatah gratis hari ini sudah habis, jadi strip ini diberi watermark. Jatah kembali penuh jam 00.00 WIB.
            </p>
          )}

          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">Ukuran</span>
              <span className="text-muted tabular-nums">{px} px</span>
            </div>
            <div ref={formatRef} className="no-scrollbar relative flex gap-1 overflow-x-auto rounded-full border border-border bg-surface p-0.5 font-bold">
              <span data-pill aria-hidden className="invisible absolute top-0.5 bottom-0.5 left-0 rounded-full bg-accent" />
              {FORMAT_IDS.map((id) => (
                <button
                  key={id}
                  data-item
                  onClick={() => setDesign({ format: id })}
                  aria-pressed={design.format === id}
                  className={`relative z-10 shrink-0 flex-1 rounded-full px-3 py-1 whitespace-nowrap transition-colors duration-200 ${design.format === id ? 'text-white' : ''}`}
                >
                  {SHORT[id]}
                </button>
              ))}
            </div>
            {design.format === 'cetak' && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={hd} onChange={(e) => setHd(e.target.checked)} className="size-4 accent-accent" />
                HD 2× (600 dpi, berkas lebih besar)
              </label>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <SparkleButton burst={done.jpg} buttonClassName="btn btn-primary hidden w-full sm:inline-flex" disabled={!!busy} onClick={() => save('jpg')}>
              {busy === 'jpg' ? 'Membuat…' : 'Unduh JPG'}
            </SparkleButton>
            <SparkleButton burst={done.png} buttonClassName="btn w-full" disabled={!!busy} onClick={() => save('png')}>
              {busy === 'png' ? 'Membuat…' : 'Unduh PNG'}
            </SparkleButton>
            {live && (
              <SparkleButton burst={done.gif} className="col-span-2" buttonClassName="btn w-full" disabled={!!busy} onClick={() => save('gif')}>
                {busy === 'gif' ? `Membuat GIF… ${Math.round(progress * 100)}%` : 'Unduh GIF live ✨'}
              </SparkleButton>
            )}
            {canShare && (
              <button className="btn col-span-2" disabled={!!busy} onClick={share}>
                Bagikan / simpan ke galeri
              </button>
            )}
          </div>
          {error && <p role="alert" className="text-sm font-semibold text-danger">{error}</p>}
          <p className="text-xs text-muted">
            {design.format === 'cetak' ? `Siap cetak 300 dpi: ${input.layout.print}.` : `Pas untuk ${FORMATS[design.format].label}.`} Unduh ulang, ganti
            ukuran/format, atau ubah stiker strip yang sama tidak memakan jatah.
          </p>
        </div>

        <RoomCard empty={empty} />

        <div className="flex gap-2 pb-4">
          <button className="btn flex-1 text-sm" onClick={(e) => stepTo('/app/hias', e)}>
            ← Hias lagi
          </button>
          <button
            className="btn flex-1 text-sm"
            onClick={(e) => stepTo('/app/foto', e, () => (void leaveRoom(), resetPhotos()))}
          >
            Foto lagi
          </button>
        </div>
      </aside>
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur sm:hidden">
        <button className="btn btn-primary min-h-12 w-full" disabled={!!busy} onClick={() => save('jpg')}>
          {busy === 'jpg' ? 'Membuat JPG…' : 'Unduh JPG'}
        </button>
      </div>
    </div>
  )
}
