import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { MiniStrip } from '../components/MiniStrip'
import { QuotaBar } from '../components/LoginSheet'
import { loginPath, useAuth } from '../lib/api'
import { downloadBlob, fileName, hasLive, renderBlob, renderGif, type Format } from '../lib/export'
import { sendPatungan } from '../lib/share'
import { renderInput, useBooth } from '../store'

type Busy = 'png' | 'jpg' | 'gif' | 'share' | null

export function ResultPage() {
  const navigate = useNavigate()
  const { design, photos, stripId, resetPhotos } = useBooth()
  const { user, quota, claimStrip } = useAuth()
  const input = useMemo(() => renderInput({ design, photos }), [design, photos])
  const [hd, setHd] = useState(false)
  const [busy, setBusy] = useState<Busy>(null)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [claimed, setClaimed] = useState<Record<string, boolean>>({})
  const [last, setLast] = useState<Blob | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const [previewScale, setPreviewScale] = useState(0.3)

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
      const watermark = stripId in claimed ? claimed[stripId] : await claimStrip(stripId)
      setClaimed((c) => ({ ...c, [stripId]: watermark }))
      const blob =
        kind === 'gif'
          ? await renderGif(input, { watermark, onProgress: setProgress })
          : await renderBlob(input, { scale: hd ? 2 : 1, watermark, format: kind as Format })
      setLast(blob)
      downloadBlob(blob, fileName(kind))
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
    } catch {
      /* dibatalkan */
    } finally {
      setBusy(null)
    }
  }

  const canShare = !!last && typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([last], 'x.png', { type: last.type })] })
  const px = `${input.layout.width * (hd ? 2 : 1)}×${input.layout.height * (hd ? 2 : 1)}`

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col gap-4 overflow-y-auto p-4 lg:flex-row lg:p-6">
      <div ref={boxRef} className="flex min-h-[45dvh] flex-1 items-center justify-center lg:min-h-0">
        <MiniStrip input={input} scale={previewScale} placeholders={false} className="max-h-full max-w-full shadow-[0_10px_30px_rgba(31,26,23,0.3)]" />
      </div>

      <aside className="flex flex-col gap-4 lg:w-96">
        <div className="card space-y-4 p-4">
          <h1 className="font-display text-2xl font-bold">Strip-mu sudah jadi!</h1>
          {user ? (
            <QuotaBar used={quota.used} limit={quota.limit} />
          ) : (
            <p className="text-sm text-soft">Masuk dulu untuk mengunduh. Gratis {quota.limit} strip per hari tanpa watermark.</p>
          )}
          {willWatermark && (
            <p className="rounded-xl bg-sun/60 p-3 text-sm">
              Jatah gratis hari ini sudah habis, jadi strip ini diberi watermark. Jatah kembali penuh jam 00.00 WIB.
            </p>
          )}

          <div className="flex items-center justify-between text-sm">
            <span>
              Ukuran <span className="text-soft">({px} px)</span>
            </span>
            <div className="flex rounded-full border-2 border-ink p-0.5 font-bold">
              <button onClick={() => setHd(false)} aria-pressed={!hd} className={`rounded-full px-3 py-1 ${!hd ? 'bg-ink text-cream' : ''}`}>
                Cetak
              </button>
              <button onClick={() => setHd(true)} aria-pressed={hd} className={`rounded-full px-3 py-1 ${hd ? 'bg-ink text-cream' : ''}`}>
                HD 2×
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button className="btn bg-pop text-white" disabled={!!busy} onClick={() => save('jpg')}>
              {busy === 'jpg' ? 'Membuat…' : 'Unduh JPG'}
            </button>
            <button className="btn bg-paper" disabled={!!busy} onClick={() => save('png')}>
              {busy === 'png' ? 'Membuat…' : 'Unduh PNG'}
            </button>
            {live && (
              <button className="btn col-span-2 bg-sky" disabled={!!busy} onClick={() => save('gif')}>
                {busy === 'gif' ? `Membuat GIF… ${Math.round(progress * 100)}%` : 'Unduh GIF live ✨'}
              </button>
            )}
            {canShare && (
              <button className="btn col-span-2 bg-paper" disabled={!!busy} onClick={share}>
                Bagikan / simpan ke galeri
              </button>
            )}
          </div>
          {error && <p className="text-sm font-semibold text-pop-dark">{error}</p>}
          <p className="text-xs text-soft">
            Siap cetak 300 dpi: {input.layout.print}. Unduh ulang, ganti format, atau ubah stiker strip yang sama tidak memakan jatah.
          </p>
        </div>

        <div className="rounded-2xl border-2 border-dashed border-ink/30 p-4 text-sm">
          <p className="font-bold">{empty ? `Masih ada ${empty} frame kosong` : 'Mau temanmu ikut punya?'}</p>
          <p className="mt-1 text-soft">
            {empty
              ? 'Kirim berkas patungan ke teman supaya dia mengisi frame yang kosong dari HP-nya.'
              : 'Kirim berkas patungan; temanmu bisa membuka, menghias ulang, dan mengunduh strip yang sama.'}
          </p>
          <button className="btn mt-3 w-full bg-sky text-sm" onClick={() => void sendPatungan(design, photos, user?.name ?? null)}>
            Kirim ke teman
          </button>
        </div>

        <div className="rounded-2xl bg-ink p-4 text-sm text-cream">
          <p className="font-bold">Segera: simpan & bagikan lewat link/QR</p>
          <p className="mt-1 text-cream/70">Strip tersimpan di cloud dan bisa dibuka lewat link atau QR code. Fitur premium.</p>
        </div>

        <div className="flex gap-2 pb-4">
          <button className="btn flex-1 bg-paper text-sm" onClick={() => navigate('/app/hias')}>
            ← Hias lagi
          </button>
          <button
            className="btn flex-1 bg-paper text-sm"
            onClick={() => {
              resetPhotos()
              navigate('/app/foto')
            }}
          >
            Foto lagi
          </button>
        </div>
      </aside>
    </div>
  )
}
