import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useStepNav } from '../components/Curtain'
import { EstafetWarning, useTimeLeft } from '../components/Estafet'
import { MiniStrip } from '../components/MiniStrip'
import { MemberChip } from '../components/Room'
import { useAuth } from '../lib/api'
import { layoutById } from '../lib/layouts'
import { openRelay, relayCode } from '../lib/relay'
import { displayName, savedName, saveName, useRoom } from '../lib/room'
import { renderInput, useBooth } from '../store'

/**
 * Tujuan link estafet (`/app/estafet#<kode>`). Memuat strip yang sudah diisi teman-teman, menjelaskan jatahmu dan
 * batas waktunya, lalu masuk ke langkah Foto.
 */
export function EstafetPage() {
  const stepTo = useStepNav()
  const code = useLocation().hash.slice(1).replace(/[^a-z0-9]/g, '')
  const { status, members, selfId, hostId, owners, perPerson, expiresAt, mode } = useRoom()
  const design = useBooth((s) => s.design)
  const photos = useBooth((s) => s.photos)
  const user = useAuth((s) => s.user)
  const [name, setName] = useState(() => savedName() || user?.name?.split(' ')[0] || '')
  const [state, setState] = useState<'loading' | 'ok' | 'gone'>(() => (relayCode() === code ? 'ok' : 'loading'))
  const left = useTimeLeft(expiresAt)

  useEffect(() => {
    if (code.length < 10) return
    if (relayCode() === code) return setState('ok')
    setState('loading')
    void openRelay(code).then((ok) => setState(ok ? 'ok' : 'gone'))
  }, [code])

  if (code.length < 10) return <Navigate to="/app" replace />

  const host = members.find((m) => m.id === hostId)
  const hostLabel = host ? displayName(host) : 'Temanmu'
  const filled = photos.filter(Boolean).length
  const mine = owners.filter((o) => o === selfId).length
  const free = owners.filter((o) => o === null).length
  const full = filled >= photos.length

  function enter(e: React.MouseEvent) {
    saveName(name)
    stepTo(full ? '/app/hias' : '/app/foto', e)
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex min-h-full max-w-md flex-col justify-center px-4 py-8">
        {state === 'loading' ? (
          <div className="card p-5 text-center">
            <span className="mx-auto block size-12 animate-spin rounded-full border-4 border-accent-subtle border-t-accent" aria-hidden />
            <h1 className="mt-4 font-heading text-xl font-bold">Membuka estafet foto…</h1>
            <p className="mt-1 text-sm text-muted">Memuat foto dari teman-temanmu.</p>
          </div>
        ) : state === 'gone' || status === 'expired' || mode !== 'estafet' ? (
          <div className="card space-y-3 p-5">
            <h1 className="font-heading text-xl font-bold">Estafet ini sudah berakhir</h1>
            <p className="text-sm text-muted">
              Link estafet cuma berlaku 4 jam, lalu semua fotonya dihapus. Minta temanmu mulai estafet baru, atau bikin strip sendiri.
            </p>
            <button className="btn btn-primary w-full" onClick={(e) => stepTo('/app', e)}>
              Bikin strip sendiri
            </button>
          </div>
        ) : (
          <div className="anim-rise card p-5">
            <p className="text-sm font-semibold text-accent">Estafet foto</p>
            <h1 className="mt-1 font-heading text-2xl font-bold">
              {full
                ? `Strip ${hostLabel} sudah penuh`
                : mine >= (perPerson ?? 1)
                  ? 'Bagianmu sudah masuk'
                  : mine
                    ? 'Lanjutkan bagianmu'
                    : `${hostLabel} ngajak kamu ikut estafet foto`}
            </h1>
            <div className="mt-4 flex gap-4">
              <div className="flex h-44 w-28 shrink-0 items-center justify-center">
                <MiniStrip input={renderInput({ design, photos })} fit={176} className="max-h-full max-w-full rounded-sm shadow-[0_6px_18px_rgba(20,24,31,0.22)]" />
              </div>
              <div className="min-w-0 text-sm">
                <p className="font-bold">{layoutById(design.layoutId).name}</p>
                <p className="text-muted">
                  {filled}/{photos.length} frame terisi · jatah {perPerson} frame per orang
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {members
                    .filter((m) => owners.includes(m.id))
                    .map((m) => (
                      <MemberChip key={m.id} m={m} selfId={selfId} frames={owners.filter((o) => o === m.id).length} />
                    ))}
                </div>
              </div>
            </div>
            {!full && (
              <label className="mt-5 block text-sm">
                <span className="font-semibold">Namamu</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={24}
                  placeholder="biar kelihatan di frame-mu"
                  className="mt-1.5 min-h-11 w-full rounded-[10px] border border-border bg-surface px-3 text-base"
                />
              </label>
            )}
            <div className="mt-4">
              <EstafetWarning until={left?.until} />
            </div>
            {!full && free === 0 && !mine && (
              <p className="mt-3 rounded-xl bg-bg-subtle p-3 text-sm text-muted">Semua frame sudah dipesan teman yang lagi foto. Tunggu sebentar, atau lihat hasilnya nanti.</p>
            )}
            <button className="btn btn-primary mt-4 w-full text-lg" onClick={enter}>
              {full ? 'Lihat, hias & unduh →' : mine >= (perPerson ?? 1) ? 'Lihat strip-nya →' : 'Isi bagianku →'}
            </button>
            {left && <p className="mt-3 text-center text-xs text-muted">Sisa {left.label} sebelum semua foto dihapus.</p>}
          </div>
        )}
      </div>
    </div>
  )
}
