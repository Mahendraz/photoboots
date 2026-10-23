import { useEffect, useState } from 'react'
import { useAuth } from '../lib/api'
import { deleteRelay, isRelayOwner, relayLink, startRelay } from '../lib/relay'
import { displayName, leaveRoom, savedName, saveName, useRoom } from '../lib/room'
import { useBooth } from '../store'
import { useUi } from '../ui'
import { useStepNav } from './Curtain'
import { LinkIcon, MemberChip } from './Room'
import { Sheet } from './Sheet'

/** Estafet berlaku 4 jam sejak dibuat (lihat RELAY_TTL_MS di worker/relay.ts). */
export const ESTAFET_HOURS = 4

const clock = (t: number) => new Date(t).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace(':', '.')

/** Sisa waktu estafet, diperbarui tiap 20 detik. */
export function useTimeLeft(expiresAt: number | null) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 20_000)
    return () => clearInterval(id)
  }, [])
  if (!expiresAt) return null
  const ms = Math.max(0, expiresAt - now)
  const h = Math.floor(ms / 3600_000)
  const m = Math.ceil((ms % 3600_000) / 60_000)
  return { ms, label: h ? `${h} jam ${m} menit` : `${m} menit`, until: clock(expiresAt) }
}

export function EstafetWarning({ until }: { until?: string }) {
  return (
    <p className="rounded-xl bg-warning-subtle p-3 text-sm text-warning">
      <b>Link estafet cuma berlaku {ESTAFET_HOURS} jam{until ? ` (sampai ${until})` : ''}.</b> Setelah itu semua foto di dalamnya langsung dihapus dari
      server. Pastikan semua sudah foto dan hasilnya diunduh sebelum waktunya habis.
    </p>
  )
}

/** Lembar mulai estafet: jatah frame per orang, nama, dan peringatan 4 jam. */
export function EstafetStartSheet() {
  const stepTo = useStepNav()
  const { estafetOpen, setEstafetOpen } = useUi()
  const photos = useBooth((s) => s.photos)
  const user = useAuth((s) => s.user)
  const filled = photos.filter(Boolean).length
  const options = [1, 2, 3].filter((n) => n <= photos.length)
  const [per, setPer] = useState(1)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!estafetOpen) return
    setName(savedName() || user?.name?.split(' ')[0] || '')
    setPer(Math.min(Math.max(1, filled), options[options.length - 1] ?? 1))
    setError(null)
    // Isi awal sekali saat lembar dibuka.
  }, [estafetOpen])

  const people = Math.ceil(photos.length / per)

  async function start(e: React.MouseEvent) {
    const at = { clientX: e.clientX }
    setBusy(true)
    setError(null)
    try {
      saveName(name)
      await startRelay(per, name)
      setEstafetOpen(false)
      stepTo('/app/foto', at)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={estafetOpen} onClose={() => setEstafetOpen(false)} title="Mulai estafet foto">
      <div className="space-y-4 text-sm">
        <p className="text-muted">
          Kamu foto duluan, lalu kirim link ke teman. Dia foto bagiannya dan meneruskan link yang sama ke teman berikutnya, sampai {photos.length} frame
          penuh. Tidak perlu online barengan.
        </p>
        <div>
          <p className="font-semibold">Satu orang boleh foto berapa frame?</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {options.map((n) => (
              <button
                key={n}
                onClick={() => setPer(n)}
                aria-pressed={per === n}
                disabled={n < filled}
                title={n < filled ? `Kamu sudah mengisi ${filled} frame` : undefined}
                className={`rounded-xl border-2 p-2.5 font-bold disabled:opacity-40 ${per === n ? 'border-accent bg-accent-subtle' : 'border-border bg-surface'}`}
              >
                {n} frame
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">
            {photos.length} frame ÷ {per} = butuh {people} orang (termasuk kamu).
          </p>
        </div>
        <label className="block">
          <span className="font-semibold">Namamu</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={24}
            placeholder="biar temanmu tahu siapa yang ngajak"
            className="mt-1.5 min-h-11 w-full rounded-[10px] border border-border bg-surface px-3 text-base"
          />
        </label>
        <EstafetWarning />
        <p className="text-xs text-muted">Foto dititipkan terenkripsi: kuncinya ada di link, server tidak bisa melihat isinya.</p>
        {error && <p className="font-semibold text-danger">{error}</p>}
        <button className="btn btn-primary w-full" disabled={busy} onClick={start}>
          {busy ? 'Menyiapkan…' : 'Paham, mulai estafet →'}
        </button>
      </div>
    </Sheet>
  )
}

/** Kirim link estafet: WhatsApp, menu bagikan, salin. */
export function EstafetShare({ compact }: { compact?: boolean }) {
  const { code, owners, perPerson, expiresAt } = useRoom()
  const [copied, setCopied] = useState(false)
  if (!code) return null
  const link = relayLink(code)
  const free = owners.filter((o) => o === null).length
  const until = expiresAt ? clock(expiresAt) : ''
  const text = `Giliranmu! Isi ${Math.min(perPerson ?? 1, free)} frame di strip foto estafet InWebBooth ini, lalu teruskan link-nya ke teman berikutnya (aktif sampai ${until}):\n${link}`

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
    } catch {
      const t = document.createElement('textarea')
      t.value = link
      document.body.appendChild(t)
      t.select()
      document.execCommand('copy')
      t.remove()
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className="grid gap-2">
      <a className="btn btn-primary w-full text-sm" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">
        Kirim ke teman berikutnya
      </a>
      <div className="flex gap-2">
        {typeof navigator.share === 'function' && (
          <button className="btn flex-1 text-sm" onClick={() => void navigator.share({ title: 'Estafet foto InWebBooth', text, url: link }).catch(() => null)}>
            Bagikan
          </button>
        )}
        <button className="btn flex-1 text-sm" onClick={copy}>
          <LinkIcon /> {copied ? 'Tersalin ✓' : compact ? 'Salin' : 'Salin link'}
        </button>
      </div>
    </div>
  )
}

/** Kartu estafet di langkah Foto: sisa waktu, kemajuan, jatahmu, kirim link, keluar/hapus. */
export function EstafetCard() {
  const stepTo = useStepNav()
  const { code, status, members, selfId, owners, perPerson, expiresAt, hostId } = useRoom()
  const photos = useBooth((s) => s.photos)
  const left = useTimeLeft(expiresAt)
  const filled = photos.filter(Boolean).length
  const mine = owners.filter((o) => o === selfId).length
  const owner = isRelayOwner(code)
  const host = members.find((m) => m.id === hostId)

  if (status === 'expired')
    return (
      <div className="rounded-2xl border border-border bg-bg-subtle p-4 text-sm">
        <p className="font-bold">Estafet sudah berakhir</p>
        <p className="mt-1 text-muted">Semua foto sudah dihapus dari server. Foto yang ada di HP ini masih bisa dihias dan diunduh selama halaman ini terbuka.</p>
        <button className="btn mt-3 w-full text-sm" onClick={() => void leaveRoom()}>
          Tutup estafet
        </button>
      </div>
    )

  return (
    <div className="rounded-2xl border border-accent/30 bg-accent-subtle/60 p-4 text-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="font-bold">Estafet foto</p>
        {left && <span className={`text-xs font-semibold ${left.ms < 30 * 60_000 ? 'text-danger' : 'text-muted'}`}>sisa {left.label}</span>}
      </div>
      <p className="mt-1 text-muted">
        {filled >= photos.length
          ? `Strip sudah penuh! Hias dan unduh sebelum ${left?.until ?? ''}, setelah itu fotonya dihapus.`
          : mine >= (perPerson ?? 1)
            ? `Bagianmu sudah masuk (${mine}/${perPerson} frame). Kirim link ini ke teman berikutnya.`
            : `Ambil ${perPerson} frame bagianmu (sudah ${mine}), lalu kirim link ke teman berikutnya.`}
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {members
          .filter((m) => m.id === selfId || owners.includes(m.id))
          .map((m) => (
            <MemberChip key={m.id} m={m} selfId={selfId} frames={owners.filter((o) => o === m.id).length} />
          ))}
      </div>
      <p className="mt-2 text-xs text-muted">
        {filled}/{photos.length} frame terisi{host && host.id !== selfId ? ` · dimulai ${displayName(host)}` : ''}
      </p>
      {filled < photos.length && (
        <div className="mt-3">
          <EstafetShare />
        </div>
      )}
      <div className="mt-2 flex gap-2">
        {filled >= photos.length && (
          <button className="btn btn-primary flex-1 text-sm" onClick={(e) => stepTo('/app/hias', e)}>
            Hias & unduh →
          </button>
        )}
        {owner ? (
          <button
            className="btn flex-1 text-sm"
            onClick={() => {
              if (confirm('Hapus estafet sekarang? Semua foto di link ini langsung dihapus dan teman tidak bisa ikut lagi.')) void deleteRelay()
            }}
          >
            Hapus sekarang
          </button>
        ) : (
          <button className="btn flex-1 text-sm" onClick={() => void leaveRoom()}>
            Keluar
          </button>
        )}
      </div>
    </div>
  )
}
