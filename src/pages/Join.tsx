import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate } from 'react-router'
import { useStepNav } from '../components/Curtain'
import { MemberChip } from '../components/Room'
import { MiniStrip } from '../components/MiniStrip'
import { useAuth } from '../lib/api'
import { layoutById } from '../lib/layouts'
import { PATUNGAN_ACCEPT, readPatungan } from '../lib/patungan'
import { displayName, joinRoom, leaveRoom, renameSelf, resumeRoom, savedName, useRoom } from '../lib/room'
import { renderInput, useBooth } from '../store'

/**
 * Halaman tujuan link ruang (`/app/bareng#<kode>`). Langsung menyambung ke tuan rumah; begitu tersambung,
 * tamu melihat siapa yang mengajak dan strip-nya, mengisi nama, lalu masuk ke langkah Foto.
 */
export function JoinPage() {
  const stepTo = useStepNav()
  const code = useMemo(() => location.hash.slice(1).replace(/[^a-z0-9]/g, ''), [])
  const { code: current, role, status, members, selfId, hostId, owners } = useRoom()
  const design = useBooth((s) => s.design)
  const photos = useBooth((s) => s.photos)
  const user = useAuth((s) => s.user)
  const [name, setName] = useState(() => savedName() || user?.name?.split(' ')[0] || '')
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const ownRoom = current === code && role === 'host'

  useEffect(() => {
    if (code.length < 6 || ownRoom) return
    // Link yang pernah dibuka di browser ini (tab tertutup, termasuk oleh pembuat ruangnya): lanjutkan
    // dengan frame dan foto yang tersimpan di perangkat ini. Kalau belum pernah, masuk sebagai tamu baru.
    void resumeRoom(code).then((resumed) => {
      if (!resumed) return joinRoom(code, name)
    })
    // Sambung sekali saat halaman dibuka; nama dikirim ulang saat masuk.
  }, [code])

  if (code.length < 6) return <Navigate to="/app" replace />
  if (ownRoom) return <Navigate to="/app/foto" replace />

  const host = members.find((m) => m.id === hostId)
  const hostLabel = host ? displayName(host) : 'Temanmu'
  const layout = layoutById(design.layoutId)
  const free = owners.filter((o) => o === null).length

  function enter(e: React.MouseEvent) {
    const me = members.find((m) => m.id === selfId)
    if (name.trim() !== (me?.name ?? '')) renameSelf(name)
    stepTo('/app/foto', e)
  }

  async function retry() {
    await leaveRoom()
    void joinRoom(code, name)
  }

  async function openFile(file: File) {
    setError(null)
    try {
      const p = await readPatungan(file)
      await leaveRoom()
      useBooth.getState().loadPatungan(p.design, p.photos, p.from)
      stepTo('/app/foto')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex min-h-full max-w-md flex-col justify-center px-4 py-8">
        {status === 'ready' ? (
          <div className="anim-rise card p-5">
            <p className="text-sm font-semibold text-accent">Foto bareng dari jauh</p>
            <h1 className="mt-1 font-heading text-2xl font-bold">{hostLabel} ngajak kamu foto bareng</h1>
            <div className="mt-4 flex gap-4">
              <div className="flex h-44 w-28 shrink-0 items-center justify-center">
                <MiniStrip input={renderInput({ design, photos })} fit={176} className="max-h-full max-w-full rounded-sm shadow-[0_6px_18px_rgba(20,24,31,0.22)]" />
              </div>
              <div className="min-w-0 text-sm">
                <p className="font-bold">{layout.name}</p>
                <p className="text-muted">
                  {photos.length} frame · {free} masih kosong
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {members.map((m) => (
                    <MemberChip key={m.id} m={m} selfId={selfId} />
                  ))}
                </div>
              </div>
            </div>
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
            {free === 0 && !owners.includes(selfId) && (
              <p className="mt-4 rounded-xl bg-warning-subtle p-3 text-sm text-warning">
                Semua frame sudah ada yang punya. Masuk saja, lalu minta {hostLabel} ganti layout yang framenya lebih banyak biar kamu kebagian.
              </p>
            )}
            <button className="btn btn-primary mt-4 w-full text-lg" onClick={enter}>
              Masuk & foto →
            </button>
            <p className="mt-3 text-center text-xs text-muted">Foto dikirim langsung ke HP teman-temanmu, tidak disimpan di server.</p>
          </div>
        ) : status === 'host-left' ? (
          <Notice
            title="Pembuat ruang terputus"
            body={`${hostLabel} keluar dari halamannya. Begitu dia buka lagi, kamu otomatis tersambung. Kalau lama, minta dia kirim link baru.`}
          >
            <button className="btn btn-primary w-full" onClick={retry}>
              Coba sambung lagi
            </button>
            <button className="btn w-full" onClick={(e) => (void leaveRoom(), stepTo('/app', e))}>
              Bikin strip sendiri
            </button>
          </Notice>
        ) : (
          <div className="card p-5 text-center">
            <span className="mx-auto block size-12 animate-spin rounded-full border-4 border-accent-subtle border-t-accent" aria-hidden />
            <h1 className="mt-4 font-heading text-xl font-bold">Menyambung ke ruang foto…</h1>
            <p className="mt-1 text-sm text-muted">Biasanya cuma beberapa detik.</p>
            {status === 'slow' && (
              <div className="mt-5 space-y-3 text-left text-sm">
                <p className="rounded-xl bg-warning-subtle p-3 text-warning">Belum nyambung juga. Ini yang biasanya jadi penyebab:</p>
                <ul className="list-disc space-y-1.5 pl-5 text-muted">
                  <li>Temanmu sudah menutup InWebBooth. Ruang cuma aktif selama dia membuka halamannya.</li>
                  <li>Jaringan seluler kadang memblokir sambungan langsung antar-HP. Coba pindah ke Wi-Fi.</li>
                </ul>
                <div className="grid gap-2 pt-1">
                  <button className="btn btn-primary w-full" onClick={retry}>
                    Coba lagi
                  </button>
                  <button className="btn w-full" onClick={() => fileRef.current?.click()}>
                    Pakai berkas patungan dari teman
                  </button>
                </div>
                <p className="text-xs text-muted">Kalau tetap gagal, minta temanmu tekan “Kirim berkas patungan” lalu buka berkasnya di sini.</p>
                {error && <p className="font-semibold text-danger">{error}</p>}
              </div>
            )}
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
          </div>
        )}
      </div>
    </div>
  )
}

function Notice({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <div className="card space-y-3 p-5">
      <h1 className="font-heading text-xl font-bold">{title}</h1>
      <p className="text-sm text-muted">{body}</p>
      {children}
    </div>
  )
}
