import { useRef, useState, type FormEvent } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { Mascot, type MascotHandle } from '../components/Mascot'
import { devLogin, emailAuth, googleLoginHref, safeBack, useAuth, type EmailAction, type EmailError } from '../lib/api'
import { stashSession } from '../lib/stash'

/** Teks mengikuti halaman login asset.inwebsite.online (versi Indonesia). */
const ERRORS: Record<EmailError, string> = {
  invalid_credentials: 'Email atau kata sandi salah.',
  email_not_verified: 'Konfirmasi email kamu terlebih dahulu: buka tautan yang kami kirim saat kamu membuat akun.',
  weak_password: 'Kata sandi itu terlalu pendek. Gunakan minimal 15 karakter; satu frasa pendek juga boleh.',
  bad_email: 'Masukkan alamat email yang valid.',
  bad_password: 'Masukkan kata sandi (hingga 72 karakter).',
  captcha: 'Harap selesaikan pemeriksaan dan coba lagi.',
  rate_limited: 'Terlalu banyak percobaan. Silakan coba lagi dalam satu menit.',
  blocked: 'Akun ini diblokir.',
  error: 'Terjadi kesalahan. Silakan coba lagi.',
}

/** Galat dari callback Auth0 (Worker mengarahkan ke sini dengan ?galat=). */
const CALLBACK_ERRORS: Record<string, string> = {
  kedaluwarsa: 'Sesi login kedaluwarsa. Silakan coba lagi.',
  gagal: 'Login gagal. Silakan coba lagi.',
  email_not_verified: ERRORS.email_not_verified,
  diblokir: ERRORS.blocked,
}

export function LoginPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const back = safeBack(params.get('returnTo'))
  const { loaded, user, quota, login, refresh } = useAuth()

  const [view, setView] = useState<EmailAction>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(CALLBACK_ERRORS[params.get('galat') ?? ''] ?? null)
  const [notice, setNotice] = useState<string | null>(null)
  const mascot = useRef<MascotHandle>(null)
  // Kucing menutup mata di kolom kata sandi dan senang di tombol utama.
  const shy = {
    onPointerEnter: () => mascot.current?.cover(true),
    onPointerLeave: (e: React.PointerEvent<HTMLInputElement>) => document.activeElement !== e.currentTarget && mascot.current?.cover(false),
    onFocus: () => mascot.current?.cover(true),
    onBlur: () => mascot.current?.cover(false),
  }
  const cheer = {
    onPointerEnter: () => mascot.current?.happy(true),
    onPointerLeave: () => mascot.current?.happy(false),
    onFocus: () => mascot.current?.happy(true),
    onBlur: () => mascot.current?.happy(false),
  }

  if (loaded && user) return <Navigate to={back} replace />

  const go = (next: EmailAction) => {
    setView(next)
    setError(null)
    setNotice(null)
  }

  // Login Google berpindah halaman: simpan dulu foto sesi ini supaya tidak hilang.
  async function google(e: React.MouseEvent<HTMLAnchorElement>) {
    e.preventDefault()
    setBusy(true)
    await stashSession()
    window.location.assign(googleLoginHref(back))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    setNotice(null)
    const result = await emailAuth(view, {
      email,
      ...(view !== 'reset' ? { password } : {}),
      ...(view === 'signup' && name.trim() ? { name } : {}),
    })
    setBusy(false)
    if (!result.ok) return setError(ERRORS[result.reason])
    if (view === 'login') {
      mascot.current?.happy(true)
      // Tanpa pindah halaman: foto di memori tetap ada.
      await refresh()
      navigate(back, { replace: true })
    } else if (view === 'signup') {
      setPassword('')
      setNotice('Hampir selesai. Kami telah mengirimkan tautan untuk mengonfirmasi alamat email kamu. Buka tautan tersebut, lalu masuk di sini.')
      setView('login')
    } else {
      setNotice('Jika email tersebut memiliki akun, tautan untuk memilih kata sandi baru sedang dalam perjalanan.')
    }
  }

  const field = 'w-full rounded-md border border-border bg-surface px-3 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-accent'
  const title = view === 'reset' ? 'Reset kata sandi kamu' : view === 'signup' ? 'Buat akun InWebBooth' : 'Masuk ke InWebBooth'
  const body =
    view === 'reset'
      ? 'Masukkan email kamu dan kami akan mengirimkan tautan untuk memilih kata sandi baru.'
      : `Gratis ${quota.limit} strip per hari tanpa watermark. Foto sesi solo diproses di perangkat. Saat memakai foto bareng atau estafet, foto yang dibagikan disimpan sementara dengan enkripsi. Akun digunakan untuk menghitung jatah unduhan.`

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-sm flex-col items-center px-4 py-6 sm:py-10">
        <div className="relative w-full pt-[104px]">
          <Mascot ref={mascot} />
          <div className="card relative z-10 w-full p-5">
            <h1 className="text-center font-heading text-2xl font-bold">{title}</h1>
            <p className="mt-2 text-center text-sm text-muted">{body}</p>

            {!loaded && <p className="mt-6 text-center text-sm text-muted">Memuat…</p>}

            {loaded && login.configured && view !== 'reset' && (
              <>
                {login.email && (
                  <div role="tablist" className="mt-5 grid grid-cols-2 rounded-full border border-border bg-surface p-0.5 text-sm font-bold">
                    {(['login', 'signup'] as const).map((v) => (
                      <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => go(v)} className={`min-h-9 rounded-full ${view === v ? 'bg-accent text-white' : ''}`}>
                        {v === 'login' ? 'Masuk' : 'Buat akun'}
                      </button>
                    ))}
                  </div>
                )}
                <a href={googleLoginHref(back)} onClick={google} aria-disabled={busy} className="btn mt-4 w-full" {...cheer}>
                  <GoogleIcon />
                  Lanjutkan dengan Google
                </a>
                {login.email && (
                  <p className="my-4 flex items-center gap-3 text-xs text-muted before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">atau gunakan email kamu</p>
                )}
              </>
            )}

            {loaded && login.configured && login.email && (
              <form onSubmit={submit} className={`flex flex-col gap-3 ${view === 'reset' ? 'mt-5' : ''}`}>
                {view === 'signup' && (
                  <label className="block">
                    <span className="mb-1 block text-xs font-bold text-muted">Nama (opsional)</span>
                    <input name="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className={field} />
                  </label>
                )}
                <label className="block">
                  <span className="mb-1 block text-xs font-bold text-muted">Email</span>
                  <input name="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
                </label>
                {view !== 'reset' && (
                  <label className="block">
                    <span className="mb-1 flex items-center justify-between text-xs font-bold text-muted">
                      Kata Sandi
                      {view === 'login' && (
                        <button type="button" onClick={() => go('reset')} className="font-bold text-accent hover:underline">
                          Lupa kata sandi?
                        </button>
                      )}
                    </span>
                    <input
                      name="password"
                      type="password"
                      required
                      minLength={view === 'signup' ? 15 : undefined}
                      maxLength={72}
                      autoComplete={view === 'signup' ? 'new-password' : 'current-password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      aria-describedby={view === 'signup' ? 'password-hint' : undefined}
                      className={field}
                      {...shy}
                    />
                    {view === 'signup' && (
                      <span id="password-hint" className="mt-1 block text-xs text-muted">
                        Minimal 15 karakter. Frasa pendek juga boleh, misalnya “foto bareng di batam”.
                      </span>
                    )}
                  </label>
                )}
                <button type="submit" disabled={busy} className="btn btn-primary mt-1 w-full" {...cheer}>
                  {busy ? 'Sebentar…' : view === 'login' ? 'Masuk' : view === 'signup' ? 'Buat akun' : 'Kirim tautan reset'}
                </button>
              </form>
            )}

            {view === 'reset' && (
              <button type="button" onClick={() => go('login')} className="mt-3 w-full text-center text-sm font-bold text-accent hover:underline">
                Kembali ke masuk
              </button>
            )}

            {loaded && login.dev && <DevLogin onDone={async () => (await refresh(), navigate(back, { replace: true }))} />}
            {loaded && !login.configured && !login.dev && <p className="mt-5 text-center text-sm font-semibold text-danger">Login belum dikonfigurasi di server.</p>}

            <div aria-live="polite" className="mt-3 empty:hidden">
              {error && (
                <p role="alert" className="text-sm font-semibold text-danger">
                  {error}
                </p>
              )}
              {notice && <p className="text-sm">{notice}</p>}
            </div>
          </div>
        </div>
        <button onClick={() => navigate(back)} className="mt-4 text-sm font-semibold text-muted hover:underline">
          ← Kembali
        </button>
      </div>
    </div>
  )
}

function DevLogin({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('')
  return (
    <form
      className="mt-5 space-y-2 rounded-2xl border-2 border-dashed border-border p-3"
      onSubmit={async (e) => {
        e.preventDefault()
        if (await devLogin(name || 'Tester')) onDone()
      }}
    >
      <label className="block text-sm font-bold" htmlFor="dev-name">
        Mode pengembangan (tanpa Auth0)
      </label>
      <div className="flex gap-2">
        <input id="dev-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama" className="min-w-0 flex-1 rounded-md border border-border bg-surface px-4" />
        <button className="btn">Masuk</button>
      </div>
    </form>
  )
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.77.43 3.45 1.18 4.94l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
    </svg>
  )
}
