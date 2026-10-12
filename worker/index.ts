import { authConfigured, devLoginEnabled, emailLoginEnabled, getSession, handleAuthRequest, type AuthEnv, type LoginInfo, type SessionStore } from './auth'

/**
 * Worker photobooth. Sengaja kecil: login (skema asset.inwebsite.online, lihat auth.ts) + kuota strip harian.
 * Foto tidak pernah dikirim ke server; semua komposisi strip terjadi di browser.
 * Halaman & aset dilayani sebagai berkas statis; Worker hanya jalan untuk /api/* dan /auth/*.
 */
interface Env extends AuthEnv {
  DB: D1Database
  DAILY_LIMIT?: string
}

const json = (data: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...init.headers },
  })
const fail = (status: number, message: string) => json({ error: message }, { status })

/** Tanggal hari ini di WIB (UTC+7), dipakai sebagai kunci kuota harian. */
const todayWib = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10)
const limitOf = (env: Env) => Number(env.DAILY_LIMIT || 5)

function accounts(db: D1Database) {
  /** Simpan/perbarui akun saat login. false = akun diblokir (tidak diberi sesi). */
  async function onLogin(u: LoginInfo) {
    const row = await db
      .prepare(
        `INSERT INTO users (sub, email, name, email_verified, created_at, last_login_at) VALUES (?1, ?2, ?3, ?5, ?4, ?4)
         ON CONFLICT (sub) DO UPDATE SET email = ?2, name = ?3, email_verified = ?5, last_login_at = ?4
         RETURNING banned`,
      )
      .bind(u.sub, u.email ?? null, u.name ?? null, new Date().toISOString(), u.emailVerified ? 1 : 0)
      .first<{ banned: number }>()
    return !row?.banned
  }

  const store: SessionStore = {
    async sessionVersion(sub) {
      const row = await db.prepare('SELECT session_version, banned FROM users WHERE sub = ?1').bind(sub).first<{ session_version: number; banned: number }>()
      // Akun yang diblokir tidak punya sesi yang berlaku.
      return row && !row.banned ? Number(row.session_version) : null
    },
    async endSessions(sub) {
      await db.prepare('UPDATE users SET session_version = session_version + 1 WHERE sub = ?1').bind(sub).run()
    },
  }

  async function usedToday(sub: string) {
    const row = await db.prepare('SELECT COUNT(*) AS n FROM strips WHERE user_sub = ?1 AND day = ?2 AND free = 1').bind(sub, todayWib()).first<{ n: number }>()
    return row?.n ?? 0
  }

  return { onLogin, store, usedToday }
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url)
    // Login & sesi hanya jalan di https (cookie __Host-, callback Auth0 harus persis sama).
    if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
      url.protocol = 'https:'
      return Response.redirect(url.toString(), 308)
    }
    const acc = accounts(env.DB)

    const auth = await handleAuthRequest(request, url, env, acc.onLogin, acc.store)
    if (auth) return auth

    if (url.pathname === '/api/me' && request.method === 'GET') {
      const s = await getSession(request, env, acc.store)
      return json({
        user: s ? { name: s.name ?? s.email ?? 'Kamu', email: s.email, pic: s.picture } : null,
        quota: { used: s ? await acc.usedToday(s.sub) : 0, limit: limitOf(env) },
        login: {
          configured: authConfigured(env),
          email: emailLoginEnabled(env),
          dev: devLoginEnabled(env),
          turnstileSiteKey: env.TURNSTILE_SITE_KEY || null,
        },
      })
    }

    // Catat satu strip yang akan diunduh. Strip yang sama (strip_id sama) tidak dihitung dua kali,
    // jadi unduh ulang, format lain (PNG/JPG/GIF) atau edit stiker tidak memakan jatah.
    if (url.pathname === '/api/strips' && request.method === 'POST') {
      const origin = request.headers.get('Origin')
      if (origin && origin !== url.origin) return fail(403, 'Origin tidak diizinkan.')
      const s = await getSession(request, env, acc.store)
      if (!s) return fail(401, 'Masuk dulu untuk mengunduh.')
      const { id } = (await request.json().catch(() => ({}))) as { id?: string }
      if (!id || !/^[\w-]{8,64}$/.test(id)) return fail(400, 'ID strip tidak valid.')

      const limit = limitOf(env)
      const existing = await env.DB.prepare('SELECT free FROM strips WHERE user_sub = ?1 AND strip_id = ?2').bind(s.sub, id).first<{ free: number }>()
      let free: boolean
      if (existing) {
        free = existing.free === 1
      } else {
        free = (await acc.usedToday(s.sub)) < limit
        await env.DB.prepare('INSERT OR IGNORE INTO strips (user_sub, day, strip_id, free, created_at) VALUES (?1, ?2, ?3, ?4, ?5)')
          .bind(s.sub, todayWib(), id, free ? 1 : 0, Date.now())
          .run()
      }
      return json({ watermark: !free, quota: { used: await acc.usedToday(s.sub), limit } })
    }

    return fail(404, 'Tidak ditemukan.')
  },
} satisfies ExportedHandler<Env>
