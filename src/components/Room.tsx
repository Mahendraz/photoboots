import { useEffect, useState } from 'react'
import { useAuth } from '../lib/api'
import { createRoom, displayName, leaveRoom, memberColor, renameSelf, roomLink, savedName, useRoom, type Member } from '../lib/room'
import { sendPatungan } from '../lib/share'
import { layoutById, photoCount } from '../lib/layouts'
import { useBooth } from '../store'
import { PatunganHelp } from './PatunganHelp'
import { Sheet } from './Sheet'

/** Buat ruang (kalau belum) lalu buka lembar undangan. */
export async function openInvite() {
  const name = savedName() || useAuth.getState().user?.name?.split(' ')[0] || ''
  await createRoom(name)
  useRoom.getState().setInviteOpen(true)
}

export function MemberChip({ m, selfId, frames }: { m: Member; selfId: string; frames?: number }) {
  return (
    <span className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border border-border bg-surface py-1 pr-2.5 pl-1 text-xs font-semibold ${m.online ? '' : 'opacity-50'}`}>
      <span className="grid size-6 place-items-center rounded-full text-[11px] font-bold text-white" style={{ background: memberColor(m) }} aria-hidden>
        {(m.name || displayName(m))[0]?.toUpperCase()}
      </span>
      {displayName(m, selfId)}
      {frames !== undefined && <span className="font-normal text-muted">· {frames} frame</span>}
      {!m.online && <span className="font-normal text-muted">· keluar</span>}
    </span>
  )
}

/** Lembar undangan: link ruang, kirim lewat WhatsApp / bagikan / salin, dan siapa saja yang sudah masuk. */
export function InviteSheet() {
  const { code, inviteOpen, setInviteOpen, members, selfId, role } = useRoom()
  const owners = useRoom((s) => s.owners)
  const photos = useBooth((s) => s.photos)
  const design = useBooth((s) => s.design)
  const [name, setName] = useState('')
  const [copied, setCopied] = useState(false)
  const self = members.find((m) => m.id === selfId)

  useEffect(() => {
    if (inviteOpen) setName(self?.name ?? savedName())
    // Isi awal sekali saat lembar dibuka.
  }, [inviteOpen])

  if (!code) return null
  const link = roomLink(code)
  const capacity = Math.min(10, photoCount(layoutById(design.layoutId), design.photoMode))
  const text = `Yuk foto bareng di InWebBooth! Klik link ini, langsung masuk ke ruang fotoku:\n${link}`
  const canShare = typeof navigator.share === 'function'

  function commitName() {
    if (name.trim() !== (self?.name ?? '')) renameSelf(name)
  }

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
    <Sheet open={inviteOpen} onClose={() => (commitName(), setInviteOpen(false))} title="Ajak teman foto bareng">
      <div className="space-y-4 text-sm">
        <label className="block">
          <span className="font-semibold">{role === 'host' ? 'Namamu, biar temanmu tahu siapa yang ngajak' : 'Namamu di ruang ini'}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            maxLength={24}
            placeholder="mis. Rani"
            className="mt-1.5 min-h-11 w-full rounded-[10px] border border-border bg-surface px-3 text-base"
          />
        </label>

        <div>
          <span className="font-semibold">Link ruang</span>
          <div className="mt-1.5 flex gap-2">
            <input readOnly value={link} onFocus={(e) => e.target.select()} className="min-h-11 min-w-0 flex-1 rounded-[10px] border border-border bg-bg-subtle px-3 text-muted" aria-label="Link ruang" />
            <button className="btn shrink-0 px-3" onClick={copy}>
              {copied ? 'Tersalin ✓' : 'Salin'}
            </button>
          </div>
        </div>

        <div className="grid gap-2">
          <a
            className="btn btn-primary w-full"
            href={`https://wa.me/?text=${encodeURIComponent(text)}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={commitName}
          >
            <WhatsAppIcon /> Kirim lewat WhatsApp
          </a>
          {canShare && (
            <button className="btn w-full" onClick={() => (commitName(), void navigator.share({ title: 'Foto bareng di InWebBooth', text, url: link }).catch(() => null))}>
              Bagikan ke aplikasi lain
            </button>
          )}
        </div>

        <ul className="space-y-1.5 rounded-xl bg-bg-subtle p-3 text-muted">
          <li>✓ Temanmu cukup klik link. Tanpa install, tanpa daftar.</li>
          <li>✓ Muat sampai {capacity} orang, tiap orang minimal satu frame.</li>
          <li>
            ✓ <b className="text-text">{role === 'host' ? 'Biarkan halaman ini terbuka' : 'Ruang ini aktif selama pembuatnya online'}</b>
            {role === 'host' ? ' sampai semua selesai foto. Ruang tutup kalau tab ini ditutup.' : '.'}
          </li>
        </ul>

        <div>
          <p className="font-semibold">Di ruang sekarang</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {members.map((m) => (
              <MemberChip key={m.id} m={m} selfId={selfId} frames={owners.filter((o) => o === m.id).length} />
            ))}
            {members.length < 2 && <span className="self-center text-xs text-muted">Belum ada teman yang masuk.</span>}
          </div>
        </div>

        {photos.some(Boolean) && (
          <p className="text-xs text-muted">
            Temanmu nggak bisa tersambung?{' '}
            <button className="font-semibold text-accent underline" onClick={() => void sendPatungan(design, photos, self?.name || null)}>
              Kirim berkas patungan saja
            </button>
          </p>
        )}
      </div>
    </Sheet>
  )
}

/**
 * Kartu "foto bareng" di langkah Foto & Unduh. Di luar ruang: ajakan lewat link (utama) dan berkas (cadangan).
 * Di dalam ruang: siapa saja yang ikut, status sambungan, ajak lagi, keluar.
 */
export function RoomCard({ empty }: { empty: number }) {
  const { code, role, status, members, selfId, owners, setInviteOpen } = useRoom()
  const design = useBooth((s) => s.design)
  const photos = useBooth((s) => s.photos)
  const user = useAuth((s) => s.user)
  const [busy, setBusy] = useState(false)
  const online = members.filter((m) => m.online).length

  if (!code)
    return (
      <div className="rounded-2xl border-2 border-dashed border-border-strong p-4 text-sm">
        <p className="font-bold">{empty && photos.some(Boolean) ? `Sisa ${empty} frame diisi teman?` : 'Foto bareng teman dari jauh?'}</p>
        <p className="mt-1 text-muted">Kirim link ke temanmu. Dia klik, langsung ikut foto dari HP-nya, dan fotonya muncul di sini saat itu juga.</p>
        <button
          className="btn btn-primary mt-3 w-full text-sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            await openInvite().finally(() => setBusy(false))
          }}
        >
          <LinkIcon /> {busy ? 'Menyiapkan ruang…' : 'Ajak lewat link'}
        </button>
        <PatunganHelp />
        {photos.some(Boolean) && (
          <p className="text-xs text-muted">
            Nggak bisa online barengan?{' '}
            <button className="font-semibold text-accent underline" onClick={() => void sendPatungan(design, photos, user?.name ?? null)}>
              Kirim berkas patungan
            </button>
          </p>
        )}
      </div>
    )

  return (
    <div className="rounded-2xl border border-accent/30 bg-accent-subtle/60 p-4 text-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="font-bold">Ruang foto bareng</p>
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-success">
          <span className={`size-2 rounded-full ${status === 'ready' ? 'animate-pulse bg-success' : 'bg-border-strong'}`} aria-hidden />
          {status === 'ready' ? `${online} orang online` : status === 'host-left' ? 'ruang tutup' : 'menyambung…'}
        </span>
      </div>
      {status === 'host-left' ? (
        <p className="mt-1 text-muted">Pembuat ruang sudah keluar. Foto yang sudah masuk tetap ada, kamu masih bisa hias dan unduh.</p>
      ) : role === 'host' ? (
        <p className="mt-1 text-muted">{online < 2 ? 'Menunggu temanmu klik link…' : 'Frame yang mereka foto langsung muncul di sini.'} Jangan tutup halaman ini dulu.</p>
      ) : (
        <p className="mt-1 text-muted">Ketuk frame kosong yang mau kamu isi, lalu foto. Semua orang melihat hasilnya langsung.</p>
      )}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {members.map((m) => (
          <MemberChip key={m.id} m={m} selfId={selfId} frames={owners.filter((o) => o === m.id).length} />
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        {status !== 'host-left' && (
          <button className="btn btn-primary flex-1 text-sm" onClick={() => setInviteOpen(true)}>
            <LinkIcon /> Ajak teman
          </button>
        )}
        <button
          className="btn flex-1 text-sm"
          onClick={() => {
            if (role !== 'host' || confirm('Keluar dari ruang? Teman-temanmu tidak bisa menambah foto lagi.')) void leaveRoom()
          }}
        >
          Keluar ruang
        </button>
      </div>
    </div>
  )
}

export const LinkIcon = () => (
  <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
    <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </svg>
)

const WhatsAppIcon = () => (
  <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
    <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2m0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2m4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.3c0-.1-.2-.2-.4-.3" />
  </svg>
)
