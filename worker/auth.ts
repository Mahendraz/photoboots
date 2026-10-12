/**
 * Login Auth0, skema yang sama dengan asset.inwebsite.online (assetweb/worker/auth.ts), ditangani penuh oleh Worker.
 *
 *   GET  /auth/login?returnTo=/app/unduh                    -> Auth0 Universal Login (authorization code + PKCE)
 *   GET  /auth/login?connection=google-oauth2&returnTo=...  -> langsung ke Google (dipakai halaman /app/masuk)
 *   GET  /auth/callback                                     -> tukar kode, pasang cookie sesi, kembali ke returnTo
 *   POST /auth/logout                                       -> akhiri semua sesi akun, keluar dari Auth0, kembali ke "/"
 *
 * Akun email (koneksi database Auth0, tanpa halaman login Auth0; hanya kalau EMAIL_LOGIN="true"):
 *
 *   POST /auth/email/login   { email, password }        -> password-realm grant; sesi hanya untuk email terverifikasi
 *   POST /auth/email/signup  { email, password, name? } -> Auth0 membuat akun dan mengirim tautan verifikasi
 *   POST /auth/email/reset   { email }                  -> Auth0 mengirim tautan reset (jawaban tidak membocorkan ada/tidaknya akun)
 *
 * Mode pengembangan lokal tanpa Auth0 (ENVIRONMENT=development, AUTH0_* kosong):
 *   POST /auth/dev { name } -> masuk dengan nama saja.
 *
 * Sesi = cookie bertanda tangan HMAC `__Host-pb_session` (HttpOnly, Secure, Path=/, tanpa Domain, SameSite=Lax)
 * berisi ID Auth0, nama, email, foto, dan versi sesi akun (users.session_version). Tiap permintaan yang butuh
 * login memeriksa versi itu di D1; keluar menaikkan versinya sehingga semua sesi akun di semua perangkat berakhir.
 * Di http://localhost cookie-nya `pb_session_dev` tanpa Secure.
 *
 * Kegagalan di callback dikembalikan ke halaman /app/masuk dengan ?galat=<kode> supaya pengguna melihat pesan yang rapi.
 */
import { decodeJwtPayload, pkceChallenge, randomToken, signValue, verifyValue } from './crypto'
import { safeReturnTo as safePath } from './safe-return'

export type AuthEnv = {
  AUTH0_DOMAIN?: string
  AUTH0_CLIENT_ID?: string
  AUTH0_CLIENT_SECRET?: string
  SESSION_SECRET?: string
  /** "true" menyalakan /auth/email/*. Butuh grant Password di aplikasi Auth0 dan penyedia email di Auth0. */
  EMAIL_LOGIN?: string
  /** Rahasia Cloudflare Turnstile; kalau diisi, tiap /auth/email/* butuh token yang valid. */
  TURNSTILE_SECRET?: string
  /** Site key Turnstile publik, diteruskan ke halaman login lewat /api/me. */
  TURNSTILE_SITE_KEY?: string
  /** Binding Workers Rate Limiting (wrangler.jsonc "ratelimits"), per IP. */
  AUTH_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> }
  ENVIRONMENT?: string
}

export type Session = { sub: string; name?: string; email?: string; picture?: string }
/** Yang diketahui callback tentang pengguna saat login (emailVerified tidak disimpan di cookie). */
export type LoginInfo = Session & { emailVerified: boolean }

/** Versi sesi di server (worker/accounts.ts). Tanpa ini tidak ada sesi yang diterbitkan atau diterima. */
export type SessionStore = {
  /** Versi sesi akun saat ini; null kalau akunnya tidak ada. */
  sessionVersion(sub: string): Promise<number | null>
  /** Akhiri semua sesi akun. */
  endSessions(sub: string): Promise<void>
}

const SESSION_COOKIE = '__Host-pb_session'
/** Cookie sesi di http://localhost, tempat cookie `__Host-` (Secure) tidak disimpan semua browser. */
const DEV_SESSION_COOKIE = 'pb_session_dev'
const LOGIN_COOKIE = 'pb_login'
const SESSION_MAX_AGE = 60 * 60 * 24 * 30 // 30 hari
const LOGIN_MAX_AGE = 60 * 10 // perjalanan ke Auth0 harus selesai dalam 10 menit
/** Koneksi yang boleh diminta langsung; selain itu jatuh ke halaman login Auth0. */
const CONNECTIONS = new Set(['google-oauth2'])
/** Koneksi database Auth0 untuk akun email (sama dengan aplikasi InWebsite lain di tenant ini). */
const DB_CONNECTION = 'Username-Password-Authentication'
const PASSWORD_REALM = 'http://auth0.com/oauth/grant-type/password-realm'
const LOGIN_PAGE = '/app/masuk'

export function authConfigured(env: AuthEnv) {
  return Boolean(env.AUTH0_DOMAIN && env.AUTH0_CLIENT_ID && env.AUTH0_CLIENT_SECRET && env.SESSION_SECRET)
}

export function emailLoginEnabled(env: AuthEnv) {
  return authConfigured(env) && env.EMAIL_LOGIN === 'true'
}

export function devLoginEnabled(env: AuthEnv) {
  return env.ENVIRONMENT === 'development' && !authConfigured(env) && Boolean(env.SESSION_SECRET)
}

/** Tujuan setelah login: hanya path di dalam app, default /app. */
export function safeReturnTo(value: string | null | undefined) {
  const p = safePath(value)
  return p === '/app' || p.startsWith('/app/') || p.startsWith('/app?') ? p : '/app'
}

export function getCookie(request: Request, name: string) {
  for (const part of (request.headers.get('Cookie') ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return v.join('=')
  }
  return undefined
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

function isLocalHttp(url: URL) {
  return url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname)
}

export function sessionCookieName(url: URL) {
  return isLocalHttp(url) ? DEV_SESSION_COOKIE : SESSION_COOKIE
}

function cookie(url: URL, name: string, value: string, maxAge: number, path = '/') {
  return `${name}=${value}; Path=${path}; Max-Age=${maxAge}; HttpOnly${isLocalHttp(url) ? '' : '; Secure'}; SameSite=Lax`
}

/**
 * Apakah permintaan yang mengubah state datang dari halaman situs ini sendiri: header Origin, atau
 * (untuk browser langka yang tidak mengirimnya) Sec-Fetch-Site. Pelindung CSRF di atas cookie SameSite=Lax.
 */
export function isSameOrigin(request: Request, url: URL) {
  const origin = request.headers.get('Origin')
  if (origin) return origin === url.origin
  return request.headers.get('Sec-Fetch-Site') === 'same-origin'
}

function redirect(location: string, cookies: string[] = [], status = 302) {
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store' })
  for (const c of cookies) headers.append('Set-Cookie', c)
  return new Response(null, { status, headers })
}

/** Kembali ke halaman login dengan kode galat (pesannya ada di halaman /app/masuk). */
const toLoginPage = (code: string, returnTo: string, cookies: string[] = []) =>
  redirect(`${LOGIN_PAGE}?${new URLSearchParams({ galat: code, returnTo })}`, cookies)

type SessionPayload = Session & { sv?: unknown } & Record<string, unknown>

/**
 * Pengguna yang sedang masuk, atau null. Cookie harus bertanda tangan, belum kedaluwarsa, dan membawa
 * versi sesi akun yang berlaku (jadi keluar di mana pun mengakhirinya).
 */
export async function getSession(request: Request, env: AuthEnv, store: SessionStore | null): Promise<Session | null> {
  if (!store || !env.SESSION_SECRET) return null
  const payload = await verifyValue<SessionPayload>(getCookie(request, sessionCookieName(new URL(request.url))), env.SESSION_SECRET)
  if (!payload?.sub || typeof payload.sv !== 'number') return null
  if ((await store.sessionVersion(payload.sub)) !== payload.sv) return null
  return { sub: payload.sub, name: payload.name, email: payload.email, picture: payload.picture }
}

/** Baris Set-Cookie yang memulai sesi untuk pengguna yang baru masuk (setelah onLogin menyimpan akunnya). */
async function startSession(url: URL, env: AuthEnv, store: SessionStore, login: LoginInfo) {
  const { emailVerified: _verified, ...session } = login
  void _verified
  const sv = (await store.sessionVersion(session.sub)) ?? 0
  const value = await signValue({ ...session, sv }, env.SESSION_SECRET!, SESSION_MAX_AGE)
  return [cookie(url, sessionCookieName(url), value, SESSION_MAX_AGE)]
}

/**
 * Memeriksa klaim ID token. Tanda tangannya tidak diperiksa: token datang langsung dari endpoint token
 * Auth0 lewat TLS sebagai ganti client secret kita, yang diterima OpenID Connect Core (3.1.3.7)
 * sebagai pengganti validasi tanda tangan.
 */
export function verifyIdToken(idToken: string, env: Required<Pick<AuthEnv, 'AUTH0_DOMAIN' | 'AUTH0_CLIENT_ID'>>, nonce: string | null) {
  const claims = decodeJwtPayload(idToken)
  if (!claims) throw new Error('unreadable ID token')
  const aud = claims.aud
  if (claims.iss !== `https://${env.AUTH0_DOMAIN}/`) throw new Error('ID token issuer mismatch')
  if (!(aud === env.AUTH0_CLIENT_ID || (Array.isArray(aud) && aud.includes(env.AUTH0_CLIENT_ID)))) throw new Error('ID token audience mismatch')
  if (typeof claims.exp !== 'number' || claims.exp < Date.now() / 1000 - 60) throw new Error('ID token expired')
  // Alur redirect selalu membawa nonce; hanya password grant (tanpa redirect) yang memberi null.
  if (nonce !== null && claims.nonce !== nonce) throw new Error('ID token nonce mismatch')
  if (typeof claims.sub !== 'string' || !claims.sub) throw new Error('ID token without subject')
  const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined)
  return {
    sub: claims.sub,
    name: str(claims.name) ?? str(claims.nickname),
    email: str(claims.email),
    picture: str(claims.picture),
    emailVerified: claims.email_verified === true,
  } satisfies LoginInfo
}

/**
 * Login yang butuh email terkonfirmasi: akun database Auth0 (auth0|...) dan passwordless (email|...),
 * karena siapa pun bisa mengetik alamat apa pun. Login sosial (Google) sudah diperiksa penyedianya.
 */
export function needsVerifiedEmail(login: LoginInfo) {
  return !login.emailVerified && /^(auth0|email)\|/.test(login.sub)
}

function notConfigured() {
  return new Response('Login belum dikonfigurasi di server (AUTH0_* / SESSION_SECRET / DB kosong).', { status: 503 })
}

async function login(url: URL, env: AuthEnv) {
  const verifier = randomToken(32)
  const state = randomToken(16)
  const nonce = randomToken(16)
  const returnTo = safeReturnTo(url.searchParams.get('returnTo'))
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: env.AUTH0_CLIENT_ID!,
    redirect_uri: `${url.origin}/auth/callback`,
    scope: 'openid profile email',
    state,
    nonce,
    code_challenge: await pkceChallenge(verifier),
    code_challenge_method: 'S256',
    ui_locales: 'id',
  })
  const connection = url.searchParams.get('connection')
  if (connection && CONNECTIONS.has(connection)) params.set('connection', connection)
  const pending = await signValue({ state, nonce, verifier, returnTo }, env.SESSION_SECRET!, LOGIN_MAX_AGE)
  return redirect(`https://${env.AUTH0_DOMAIN}/authorize?${params}`, [cookie(url, LOGIN_COOKIE, pending, LOGIN_MAX_AGE, '/auth')])
}

async function callback(request: Request, url: URL, env: AuthEnv, onLogin: (s: LoginInfo) => Promise<boolean>, store: SessionStore) {
  const pending = await verifyValue<{ state: string; nonce: string; verifier: string; returnTo: string }>(
    getCookie(request, LOGIN_COOKIE),
    env.SESSION_SECRET!,
  )
  const clearLogin = cookie(url, LOGIN_COOKIE, '', 0, '/auth')
  const back = pending?.returnTo ?? '/app'
  // Mis. pengguna membatalkan di halaman Google/Auth0: kembali tanpa sesi.
  if (url.searchParams.get('error')) return redirect(back, [clearLogin])
  const code = url.searchParams.get('code')
  if (!pending || !code || url.searchParams.get('state') !== pending.state) return toLoginPage('kedaluwarsa', back, [clearLogin])

  const res = await fetch(`https://${env.AUTH0_DOMAIN}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: env.AUTH0_CLIENT_ID,
      client_secret: env.AUTH0_CLIENT_SECRET,
      code,
      code_verifier: pending.verifier,
      redirect_uri: `${url.origin}/auth/callback`,
    }),
  }).catch(() => null)
  if (!res?.ok) return toLoginPage('gagal', back, [clearLogin])
  let session: LoginInfo
  try {
    const tokens = (await res.json()) as { id_token?: string }
    session = verifyIdToken(tokens.id_token ?? '', { AUTH0_DOMAIN: env.AUTH0_DOMAIN!, AUTH0_CLIENT_ID: env.AUTH0_CLIENT_ID! }, pending.nonce)
  } catch {
    return toLoginPage('gagal', back, [clearLogin])
  }
  // Akun email dari halaman login Auth0 baru dapat sesi setelah emailnya dikonfirmasi, supaya orang tidak
  // memanen jatah harian gratis dengan alamat sekali pakai.
  if (needsVerifiedEmail(session)) return toLoginPage('email_not_verified', back, [clearLogin])
  if (!(await onLogin(session))) return toLoginPage('diblokir', back, [clearLogin])
  return redirect(back, [clearLogin, ...(await startSession(url, env, store, session))])
}

/**
 * Selalu kembali ke "/" (yang diarahkan ke /app): Auth0 hanya mau kembali ke URL yang persis terdaftar di
 * Allowed Logout URLs aplikasi (path tidak bisa diberi wildcard).
 */
async function logout(request: Request, url: URL, env: AuthEnv, store: SessionStore) {
  // Tautan atau <img> di situs lain tidak boleh mengeluarkan orang: hanya POST dari halaman situs ini.
  if (request.method !== 'POST') {
    return new Response('Keluar lewat tombol Keluar di menu akun.', { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' } })
  }
  if (!isSameOrigin(request, url)) return new Response('Forbidden', { status: 403, headers: { 'Cache-Control': 'no-store' } })
  // Mengakhiri semua sesi akun (juga di perangkat lain). Hanya sesi yang masih berlaku yang bisa melakukannya.
  const session = await getSession(request, env, store)
  if (session) await store.endSessions(session.sub)
  const clear = [cookie(url, sessionCookieName(url), '', 0)]
  if (!authConfigured(env)) return redirect('/app', clear, 303)
  const params = new URLSearchParams({ client_id: env.AUTH0_CLIENT_ID!, returnTo: `${url.origin}/` })
  // 303: browser mengikuti POST ini dengan GET ke halaman logout Auth0.
  return redirect(`https://${env.AUTH0_DOMAIN}/v2/logout?${params}`, clear, 303)
}

const MAX_EMAIL = 254
const MAX_PASSWORD = 72 // Auth0 (bcrypt) mengabaikan lebih dari 72 byte
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } })
}

async function turnstileOk(env: AuthEnv, token: unknown, ip: string) {
  if (!env.TURNSTILE_SECRET) return true
  if (typeof token !== 'string' || !token) return false
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token, remoteip: ip }),
    })
    return ((await res.json()) as { success?: boolean }).success === true
  } catch {
    return false
  }
}

/** POST /auth/email/{login,signup,reset}. JSON masuk, JSON keluar. */
async function emailAuth(request: Request, url: URL, env: AuthEnv, onLogin: (s: LoginInfo) => Promise<boolean>, store: SessionStore) {
  if (!emailLoginEnabled(env)) return jsonResponse({ error: 'disabled' }, 404)
  // Cookie sesi SameSite=Lax, tapi login CSRF tetap bisa memasukkan pengunjung sebagai orang lain.
  if (request.headers.get('Origin') !== url.origin) return jsonResponse({ error: 'forbidden' }, 403)
  const ip = request.headers.get('CF-Connecting-IP') ?? ''
  if (env.AUTH_LIMITER && !(await env.AUTH_LIMITER.limit({ key: ip || 'unknown' })).success) return jsonResponse({ error: 'rate_limited' }, 429)

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return jsonResponse({ error: 'bad_request' }, 400)
  }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (!email || email.length > MAX_EMAIL || !EMAIL_RE.test(email)) return jsonResponse({ error: 'bad_email' }, 400)
  if (!(await turnstileOk(env, body.turnstile, ip))) return jsonResponse({ error: 'captcha' }, 400)

  const base = `https://${env.AUTH0_DOMAIN}`
  const action = url.pathname.slice('/auth/email/'.length)

  if (action === 'reset') {
    // Jawaban sama entah emailnya punya akun atau tidak, jadi tidak bisa dipakai mencari email.
    await fetch(`${base}/dbconnections/change_password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: env.AUTH0_CLIENT_ID, email, connection: DB_CONNECTION }),
    }).catch(() => undefined)
    return jsonResponse({ ok: true })
  }

  if (!password || password.length > MAX_PASSWORD) return jsonResponse({ error: 'bad_password' }, 400)

  if (action === 'signup') {
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : ''
    const res = await fetch(`${base}/dbconnections/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: env.AUTH0_CLIENT_ID, email, password, connection: DB_CONNECTION, ...(name ? { name } : {}) }),
    }).catch(() => null)
    if (!res) return jsonResponse({ error: 'unavailable' }, 502)
    if (res.ok) return jsonResponse({ ok: true })
    const err = (await res.json().catch(() => ({}))) as { code?: string; name?: string }
    // Alamat yang sudah punya akun dijawab sama seperti alamat baru (tidak ada pencarian akun).
    if (err.code === 'user_exists' || err.name === 'UserExistsError') return jsonResponse({ ok: true })
    if (err.code === 'invalid_password' || err.name === 'PasswordStrengthError' || err.name === 'PasswordNoUserInfoError') return jsonResponse({ error: 'weak_password' }, 400)
    if (res.status === 429) return jsonResponse({ error: 'rate_limited' }, 429)
    return jsonResponse({ error: 'unavailable' }, 502)
  }

  if (action === 'login') {
    const res = await fetch(`${base}/oauth/token`, {
      method: 'POST',
      // Supaya proteksi brute-force Auth0 melihat IP pengunjung, bukan IP Worker (butuh setelan
      // "Trust Token Endpoint IP Header" di aplikasi Auth0; diabaikan kalau tidak aktif).
      headers: { 'Content-Type': 'application/json', ...(ip ? { 'auth0-forwarded-for': ip } : {}) },
      body: JSON.stringify({
        grant_type: PASSWORD_REALM,
        realm: DB_CONNECTION,
        username: email,
        password,
        scope: 'openid profile email',
        client_id: env.AUTH0_CLIENT_ID,
        client_secret: env.AUTH0_CLIENT_SECRET,
      }),
    }).catch(() => null)
    if (!res) return jsonResponse({ error: 'unavailable' }, 502)
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string }
      if (err.error === 'too_many_attempts' || res.status === 429) return jsonResponse({ error: 'rate_limited' }, 429)
      if (err.error === 'invalid_grant' || err.error === 'access_denied') return jsonResponse({ error: 'invalid_credentials' }, 401)
      return jsonResponse({ error: 'unavailable' }, 502)
    }
    let session: LoginInfo
    try {
      const tokens = (await res.json()) as { id_token?: string }
      session = verifyIdToken(tokens.id_token ?? '', { AUTH0_DOMAIN: env.AUTH0_DOMAIN!, AUTH0_CLIENT_ID: env.AUTH0_CLIENT_ID! }, null)
    } catch {
      return jsonResponse({ error: 'unavailable' }, 502)
    }
    if (!session.emailVerified) return jsonResponse({ error: 'email_not_verified' }, 403)
    if (!(await onLogin(session))) return jsonResponse({ error: 'blocked' }, 403)
    const done = jsonResponse({ ok: true })
    for (const c of await startSession(url, env, store, session)) done.headers.append('Set-Cookie', c)
    return done
  }

  return jsonResponse({ error: 'not_found' }, 404)
}

/** POST /auth/dev: login dengan nama saja, hanya di mode pengembangan lokal tanpa Auth0. */
async function devLogin(request: Request, url: URL, env: AuthEnv, onLogin: (s: LoginInfo) => Promise<boolean>, store: SessionStore) {
  if (!devLoginEnabled(env) || !isLocalHttp(url)) return jsonResponse({ error: 'not_found' }, 404)
  const { name } = (await request.json().catch(() => ({}))) as { name?: string }
  const clean = (typeof name === 'string' && name.trim() ? name.trim() : 'Tester').slice(0, 40)
  const slug = clean.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tester'
  const login: LoginInfo = { sub: `dev|${slug}`, name: clean, email: `${slug}@dev.local`, emailVerified: true }
  if (!(await onLogin(login))) return jsonResponse({ error: 'blocked' }, 403)
  const done = jsonResponse({ ok: true })
  for (const c of await startSession(url, env, store, login)) done.headers.append('Set-Cookie', c)
  return done
}

/**
 * Menangani /auth/*; null untuk path lain. `onLogin` menyimpan akun dan mengembalikan false kalau akunnya diblokir.
 */
export async function handleAuthRequest(
  request: Request,
  url: URL,
  env: AuthEnv,
  onLogin: (s: LoginInfo) => Promise<boolean>,
  store: SessionStore | null,
) {
  if (!url.pathname.startsWith('/auth/')) return null
  if (url.pathname === '/auth/dev') {
    if (request.method !== 'POST' || !store) return new Response(null, { status: 405 })
    return devLogin(request, url, env, onLogin, store)
  }
  if (url.pathname.startsWith('/auth/email/')) {
    if (request.method !== 'POST') return new Response(null, { status: 405 })
    if (!authConfigured(env) || !store) return notConfigured()
    return emailAuth(request, url, env, onLogin, store)
  }
  if (url.pathname === '/auth/logout') {
    if (!store || !env.SESSION_SECRET) return notConfigured()
    return logout(request, url, env, store)
  }
  if (request.method !== 'GET') return new Response(null, { status: 405 })
  if (!authConfigured(env) || !store) return notConfigured()
  switch (url.pathname) {
    case '/auth/login':
      return login(url, env)
    case '/auth/callback':
      return callback(request, url, env, onLogin, store)
    default:
      return new Response('Not found', { status: 404 })
  }
}
