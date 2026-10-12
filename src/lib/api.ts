import { create } from 'zustand'

export interface User {
  name: string
  email?: string
  pic?: string
}
export interface Quota {
  used: number
  limit: number
}
export interface LoginOptions {
  /** Auth0 sudah dikonfigurasi di server. */
  configured: boolean
  /** Login email + kata sandi aktif. */
  email: boolean
  /** Login dev (nama saja), hanya di lokal tanpa Auth0. */
  dev: boolean
  turnstileSiteKey: string | null
}

interface AuthState {
  loaded: boolean
  user: User | null
  quota: Quota
  login: LoginOptions
  refresh: () => Promise<void>
  /** Catat strip yang diunduh; mengembalikan apakah perlu watermark. */
  claimStrip: (id: string) => Promise<boolean>
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw Object.assign(new Error(data.error || 'Terjadi kesalahan.'), { status: res.status })
  return data
}

export const useAuth = create<AuthState>()((set) => ({
  loaded: false,
  user: null,
  quota: { used: 0, limit: 5 },
  login: { configured: false, email: false, dev: false, turnstileSiteKey: null },
  refresh: async () => {
    try {
      const me = await call<{ user: User | null; quota: Quota; login: LoginOptions }>('/api/me')
      set({ loaded: true, user: me.user, quota: me.quota, login: me.login })
    } catch {
      set({ loaded: true })
    }
  },
  claimStrip: async (id) => {
    const r = await call<{ watermark: boolean; quota: Quota }>('/api/strips', { id })
    set({ quota: r.quota })
    return r.watermark
  },
}))

/** Tujuan setelah login: hanya path di dalam app, tidak pernah halaman login itu sendiri. */
export function safeBack(raw: string | null) {
  if (!raw || !/^\/app(\/[\w-]*)*$/.test(raw) || raw.startsWith('/app/masuk')) return '/app'
  return raw
}

export const loginPath = (returnTo: string) => `/app/masuk?returnTo=${encodeURIComponent(safeBack(returnTo))}`
export const googleLoginHref = (returnTo: string) =>
  `/auth/login?connection=google-oauth2&returnTo=${encodeURIComponent(safeBack(returnTo))}`

export type EmailAction = 'login' | 'signup' | 'reset'
export type EmailError =
  | 'invalid_credentials'
  | 'email_not_verified'
  | 'weak_password'
  | 'bad_email'
  | 'bad_password'
  | 'captcha'
  | 'rate_limited'
  | 'blocked'
  | 'error'
export type EmailResult = { ok: true } | { ok: false; reason: EmailError }

const KNOWN: EmailError[] = ['invalid_credentials', 'email_not_verified', 'weak_password', 'bad_email', 'bad_password', 'captcha', 'rate_limited', 'blocked']

/** POST /auth/email/<action> (skema asset.inwebsite.online). */
export async function emailAuth(action: EmailAction, body: { email: string; password?: string; name?: string; turnstile?: string }): Promise<EmailResult> {
  try {
    const res = await fetch(`/auth/email/${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'same-origin',
    })
    if (res.ok) return { ok: true }
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    return { ok: false, reason: KNOWN.find((k) => k === data.error) ?? 'error' }
  } catch {
    return { ok: false, reason: 'error' }
  }
}

export async function devLogin(name: string) {
  const res = await fetch('/auth/dev', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
    credentials: 'same-origin',
  })
  return res.ok
}

/** Keluar: POST /auth/logout (lalu Worker mengarahkan ke logout Auth0 dan kembali ke "/"). */
export function submitLogout() {
  const form = document.createElement('form')
  form.method = 'post'
  form.action = '/auth/logout'
  document.body.appendChild(form)
  form.submit()
}
