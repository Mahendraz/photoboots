import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router'
import { loginPath, useAuth } from '../lib/api'
import { restoreSession } from '../lib/stash'
import { useUi } from '../ui'
import { Curtain, useStepNav } from './Curtain'
import { AccountSheet } from './LoginSheet'
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

  // Kembali dari login/keluar (pindah halaman): pulihkan foto sesi dulu sebelum halaman dirender,
  // supaya halaman Hias/Unduh tidak mengira sesinya kosong.
  const [restored, setRestored] = useState(false)
  useEffect(() => {
    void refresh()
    restoreSession().finally(() => setRestored(true))
  }, [refresh])

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b-2 border-ink bg-paper px-4 py-2.5 sm:px-6">
        <Link
          to="/app"
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
            e.preventDefault()
            stepTo('/app', e)
          }}
          className="flex shrink-0 items-center gap-2"
          aria-label="Photobooth, kembali ke awal"
        >
          <Logo />
          <span className="font-display text-xl font-bold tracking-tight max-sm:hidden">photobooth</span>
        </Link>

        <StepBar step={step} />

        <button
          onClick={() => (user ? openLogin() : navigate(loginPath(pathname)))}
          className="flex shrink-0 items-center gap-2 rounded-full border-2 border-ink bg-cream py-1 pr-3 pl-1 text-sm font-bold"
          aria-label={user ? `Akun ${user.name}` : 'Masuk'}
        >
          {user?.pic ? (
            <img src={user.pic} alt="" className="size-7 rounded-full" referrerPolicy="no-referrer" />
          ) : (
            <span className="grid size-7 place-items-center rounded-full bg-sun font-display">{user ? user.name[0]?.toUpperCase() : '?'}</span>
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
    </div>
  )
}
