import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router'
import { loginPath, useAuth } from '../lib/api'
import { resumeRelay } from '../lib/relay'
import { resumeRoom } from '../lib/room'
import { restoreSession } from '../lib/stash'
import { useUi } from '../ui'
import { Curtain, useStepNav } from './Curtain'
import { AccountSheet } from './LoginSheet'
import { EstafetStartSheet } from './Estafet'
import { InviteSheet } from './Room'
import { Logo } from './Logo'
import { STEPS, StepBar } from './StepBar'

export function AppShell() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const stepTo = useStepNav()
  const refresh = useAuth((s) => s.refresh)
  const user = useAuth((s) => s.user)
  const quota = useAuth((s) => s.quota)
  const openLogin = useUi((s) => s.openLogin)
  // -1 di halaman di luar 4 langkah (mis. /app/masuk): tidak ada langkah yang disorot.
  const step = STEPS.findIndex((s) => s.path === pathname.replace(/\/$/, ''))

  // Kembali dari login/keluar (pindah halaman) atau halaman ke-refresh: pulihkan foto sesi dan ruang
  // foto bareng dulu sebelum halaman dirender, supaya halaman Hias/Unduh tidak mengira sesinya kosong.
  const [restored, setRestored] = useState(false)
  useEffect(() => {
    void refresh()
    restoreSession()
      .then(() => resumeRoom())
      .then(() => resumeRelay())
      .catch(() => null)
      .finally(() => setRestored(true))
  }, [refresh])

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-border bg-surface px-3 py-2.5 sm:gap-3 sm:px-6">
        <Link
          to="/app"
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
            e.preventDefault()
            stepTo('/app', e)
          }}
          className="flex shrink-0 items-center gap-2"
          aria-label="InWebBooth, kembali ke awal"
        >
          <Logo className="size-9 sm:hidden" />
          {/* Rasio berkas 469:116; width/height eksplisit supaya kotaknya benar sebelum gambar turun. */}
          <img src="/brand/inwebbooth/logo-horizontal-light.svg" alt="" width={469} height={116} className="h-10 w-auto max-sm:hidden" />
        </Link>

        <StepBar step={step} />

        <button
          onClick={() => (user ? openLogin() : navigate(loginPath(pathname)))}
          className="flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-border bg-surface py-1 pr-3 pl-1 text-sm font-semibold transition-colors hover:border-border-strong hover:bg-bg-subtle"
          aria-label={user ? `Akun ${user.name}` : 'Masuk'}
        >
          {user?.pic ? (
            <img src={user.pic} alt="" className="size-7 rounded-full" referrerPolicy="no-referrer" />
          ) : (
            <span className="grid size-7 place-items-center rounded-full bg-accent-subtle font-heading font-bold text-accent-hover">{user ? user.name[0]?.toUpperCase() : '?'}</span>
          )}
          {user ? (
            <span className="tabular-nums" title="Strip gratis tanpa watermark yang tersisa hari ini">
              {Math.max(0, quota.limit - quota.used)}/{quota.limit}
            </span>
          ) : (
            <span>Masuk</span>
          )}
        </button>
      </header>

      <main className="relative min-h-0 flex-1">
        {restored && <Outlet />}
        <Curtain />
      </main>
      <AccountSheet />
      <InviteSheet />
      <EstafetStartSheet />
    </div>
  )
}
