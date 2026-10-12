import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router'
import { loginPath, useAuth } from '../lib/api'
import { restoreSession } from '../lib/stash'
import { useUi } from '../ui'
import { AccountSheet } from './LoginSheet'

const STEPS = [
  { path: '/app', label: 'Layout' },
  { path: '/app/foto', label: 'Foto' },
  { path: '/app/hias', label: 'Hias' },
  { path: '/app/unduh', label: 'Unduh' },
]

export function AppShell() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
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
        <Link to="/app" className="flex shrink-0 items-center gap-2" aria-label="Photobooth, kembali ke awal">
          <Logo />
          <span className="font-display text-xl font-bold tracking-tight max-sm:hidden">photobooth</span>
        </Link>

        <ol className="mx-auto flex items-center gap-1 sm:gap-2" aria-label="Langkah">
          {STEPS.map((s, i) => (
            <li key={s.path} className="flex items-center gap-1 sm:gap-2">
              {i > 0 && <span className={`h-0.5 w-3 sm:w-6 ${i <= step ? 'bg-ink' : 'bg-line'}`} />}
              <span
                aria-current={i === step ? 'step' : undefined}
                className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-bold sm:text-sm ${
                  i === step ? 'bg-ink text-cream' : i < step ? 'text-ink' : 'text-soft/60'
                }`}
              >
                <span className="font-display">{i + 1}</span>
                <span className={i === step ? '' : 'max-sm:hidden'}>{s.label}</span>
              </span>
            </li>
          ))}
        </ol>

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

      <main className="min-h-0 flex-1">{restored && <Outlet />}</main>
      <AccountSheet />
    </div>
  )
}

export function Logo({ className = 'size-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <rect x="18" y="4" width="28" height="56" rx="4" fill="#1f1a17" />
      <rect x="22" y="9" width="20" height="13" rx="2" fill="#ff4f6d" />
      <rect x="22" y="25" width="20" height="13" rx="2" fill="#ffd166" />
      <rect x="22" y="41" width="20" height="13" rx="2" fill="#7bdff2" />
    </svg>
  )
}
