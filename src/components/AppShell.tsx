import { useEffect, useRef, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router'
import { loginPath, useAuth } from '../lib/api'
import { resumeRelay } from '../lib/relay'
import { resumeRoom } from '../lib/room'
import { restoreSession, stashSession } from '../lib/stash'
import { useBooth } from '../store'
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
  const [localRestoreTimedOut, setLocalRestoreTimedOut] = useState(false)
  const [recovering, setRecovering] = useState(false)
  const [recoveryError, setRecoveryError] = useState(false)
  const [localRecoveryIssue, setLocalRecoveryIssue] = useState(false)
  const [storageSaveError, setStorageSaveError] = useState(false)
  const [recoveryAttempt, setRecoveryAttempt] = useState(0)
  const restoreController = useRef<AbortController | null>(null)
  useEffect(() => {
    let alive = true
    const controller = new AbortController()
    restoreController.current = controller
    const localTimer = window.setTimeout(() => {
      if (alive && !controller.signal.aborted) setLocalRestoreTimedOut(true)
    }, 6000)
    setRecoveryError(false)
    setLocalRecoveryIssue(false)
    setLocalRestoreTimedOut(false)
    void refresh()
    void restoreSession(controller.signal)
      .catch(() => {
        if (alive) setRecoveryError(true)
      })
      .then((result) => {
        window.clearTimeout(localTimer)
        if (!alive || controller.signal.aborted) return
        const localIssue = result === 'unavailable' || result === 'corrupt'
        setLocalRecoveryIssue(localIssue)
        // Pulihkan data lokal sebelum guard route berjalan. Pemulihan jaringan dimulai sesudahnya,
        // tetapi tidak menahan halaman utama.
        setLocalRestoreTimedOut(false)
        setRestored(true)
        setRecovering(true)
        const timer = window.setTimeout(() => {
          if (!alive) return
          setRecovering(false)
          setRecoveryError(true)
        }, 6000)
        void Promise.allSettled([resumeRoom(), resumeRelay()]).then((results) => {
          window.clearTimeout(timer)
          if (!alive) return
          setRecovering(false)
          setRecoveryError(localIssue || results.some((result) => result.status === 'rejected'))
        })
      })
    return () => {
      alive = false
      controller.abort()
      if (restoreController.current === controller) restoreController.current = null
      window.clearTimeout(localTimer)
    }
  }, [refresh, recoveryAttempt])

  // Autosave nonempty local work so a reload (including a browser crash) can recover photos and editor state.
  // Collaboration has its own room/relay persistence; this local copy is still useful as a device recovery point.
  useEffect(() => {
    if (!restored) return
    let alive = true
    let timer = 0
    const schedule = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        void stashSession().then((result) => {
          if (!alive) return
          if (result === 'unavailable') setStorageSaveError(true)
          else if (result === 'saved' || result === 'empty') setStorageSaveError(false)
        })
      }, 900)
    }
    const unsubscribe = useBooth.subscribe((next, previous) => {
      if (
        next.design !== previous.design ||
        next.photos !== previous.photos ||
        next.sparePhotos !== previous.sparePhotos ||
        next.stripId !== previous.stripId ||
        next.patunganFrom !== previous.patunganFrom
      ) schedule()
    })
    if ([...useBooth.getState().photos, ...useBooth.getState().sparePhotos].some(Boolean)) schedule()
    return () => {
      alive = false
      window.clearTimeout(timer)
      unsubscribe()
    }
  }, [restored])

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
        {restored ? (
          <>
            {recovering && (
              <p role="status" className="absolute inset-x-3 top-3 z-20 mx-auto max-w-xl rounded-xl border border-border bg-surface/95 px-4 py-3 text-center text-sm text-text-muted shadow-sm backdrop-blur">
                Menyambungkan kembali sesi foto bersama…
              </p>
            )}
            {recoveryError && (
              <div role="alert" className="absolute inset-x-3 top-3 z-30 mx-auto flex max-w-xl flex-col items-center gap-2 rounded-xl border border-warning/40 bg-surface px-4 py-3 text-center text-sm shadow-sm sm:flex-row sm:justify-between sm:text-left">
                <span>
                  {localRecoveryIssue
                    ? 'Simpanan foto lama tidak bisa dibaca. Foto di sesi ini tetap aman selama halaman terbuka.'
                    : 'Pemulihan sesi foto bersama belum selesai. Foto lokal tetap bisa dipakai.'}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setRecovering(false)
                    setRecoveryAttempt((attempt) => attempt + 1)
                  }}
                  className="min-h-11 rounded-full px-4 font-semibold text-accent-hover hover:bg-accent-subtle"
                >
                  Coba lagi
                </button>
              </div>
            )}
            {storageSaveError && (
              <div role="alert" className={`absolute inset-x-3 ${recoveryError ? 'top-20' : 'top-3'} z-30 mx-auto flex max-w-xl flex-col items-center gap-2 rounded-xl border border-warning/40 bg-surface px-4 py-3 text-center text-sm shadow-sm sm:flex-row sm:justify-between sm:text-left`}>
                <span>Penyimpanan perangkat tidak tersedia. Foto masih ada di halaman ini, tetapi belum tersimpan untuk dipulihkan setelah keluar.</span>
                <button
                  type="button"
                  onClick={() => {
                    void stashSession().then((result) => {
                      if (result === 'unavailable') setStorageSaveError(true)
                      else if (result === 'saved' || result === 'empty') setStorageSaveError(false)
                    })
                  }}
                  className="min-h-11 rounded-full px-4 font-semibold text-accent-hover hover:bg-accent-subtle"
                >
                  Coba simpan lagi
                </button>
              </div>
            )}
            <Outlet />
          </>
        ) : localRestoreTimedOut ? (
          <div role="alert" className="grid h-full place-items-center px-5 py-8">
            <div className="card w-full max-w-md p-5 text-center">
              <h1 className="font-heading text-xl font-bold">Pemulihan foto belum selesai</h1>
              <p className="mt-2 text-sm text-text-muted">Penyimpanan di perangkat ini belum merespons. Kamu bisa mencoba lagi, atau mulai sesi baru tanpa membuka foto lama.</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <button type="button" className="btn btn-primary min-h-11" onClick={() => setRecoveryAttempt((attempt) => attempt + 1)}>
                  Coba lagi
                </button>
                <button
                  type="button"
                  className="btn min-h-11"
                  onClick={() => {
                    restoreController.current?.abort()
                    setRestored(true)
                    navigate('/app', { replace: true })
                  }}
                >
                  Mulai sesi baru
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div role="status" className="grid h-full place-items-center px-6 text-center text-sm text-text-muted">
            Memulihkan foto di perangkat ini…
          </div>
        )}
        <Curtain />
      </main>
      <AccountSheet />
      <InviteSheet />
      <EstafetStartSheet />
    </div>
  )
}
