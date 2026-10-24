import { sha256Hex } from './crypto'
import { parseJsonBody, readLimitedBody } from './body'

/**
 * Estafet foto bareng (lihat migrations/0003_relays.sql). Server hanya menyimpan data terenkripsi dan menegakkan
 * aturan yang tidak butuh isi: jumlah frame, satu frame satu orang, jatah per orang, dan umur 4 jam.
 */

export interface RelayEnv {
  DB: D1Database
  ROOM_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> }
}

/** Estafet berlaku 4 jam sejak dibuat, lalu semua isinya dihapus. */
export const RELAY_TTL_MS = 4 * 60 * 60_000
const MAX_SLOTS = 10
const MAX_META = 16_000
const MAX_CREATE_BODY = 24_000
/** Satu frame: foto + rekaman live, terenkripsi. Di bawah batas nilai D1 (2 MB). */
const MAX_FRAME = 1_900_000

const json = (data: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...init.headers },
  })
const fail = (status: number, message: string, code?: string) => json({ error: message, code }, { status })

/** Hapus estafet yang sudah lewat 4 jam (dipanggil cron tiap menit dan saat estafet dibaca). */
export async function purgeRelays(db: D1Database, now = Date.now()) {
  await db.batch([
    db.prepare('DELETE FROM relay_frames WHERE relay_id IN (SELECT id FROM relays WHERE expires_at <= ?1)').bind(now),
    db.prepare('DELETE FROM relays WHERE expires_at <= ?1').bind(now),
  ])
}

async function live(db: D1Database, id: string) {
  const row = await db
    .prepare('SELECT meta, slots, per_person, owner_hash, expires_at FROM relays WHERE id = ?1')
    .bind(id)
    .first<{ meta: ArrayBuffer; slots: number; per_person: number; owner_hash: string; expires_at: number }>()
  if (row && row.expires_at <= Date.now()) {
    await purgeRelays(db)
    return null
  }
  return row
}

const b64 = (buf: ArrayBuffer | Uint8Array | number[]) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf as ArrayBuffer)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

/** Relay-scoped pseudonym; never expose the raw frame owner identifier in API responses. */
async function relayOwnerTag(id: string, who: string) {
  return `owner:${await sha256Hex(`inwebbooth-relay-owner:${id}:${who}`)}`
}

export async function relayRequest(request: Request, url: URL, env: RelayEnv, id: string, slotPart: string | undefined) {
  const db = env.DB
  const write = request.method !== 'GET'
  if (write) {
    const origin = request.headers.get('Origin')
    if (origin && origin !== url.origin) return fail(403, 'Origin tidak diizinkan.')
    const ip = request.headers.get('CF-Connecting-IP') ?? 'local'
    if (env.ROOM_LIMITER && !(await env.ROOM_LIMITER.limit({ key: ip })).success) return fail(429, 'Terlalu sering, coba lagi sebentar.')
  }

  // ---------------------------------------------------------------- estafet
  if (slotPart === undefined) {
    if (request.method === 'GET') {
      const r = await live(db, id)
      if (!r) return fail(404, 'Estafet sudah berakhir atau tidak ada.', 'gone')
      const frames = await db
        .prepare('SELECT slot, who, updated_at FROM relay_frames WHERE relay_id = ?1 ORDER BY slot')
        .bind(id)
        .all<{ slot: number; who: string; updated_at: number }>()
      const requestedWho = request.headers.get('X-Who') ?? ''
      const viewer = /^[0-9a-f]{64}$/.test(requestedWho) ? requestedWho : ''
      return json({
        meta: b64(r.meta),
        slots: r.slots,
        perPerson: r.per_person,
        expiresAt: r.expires_at,
        frames: await Promise.all(
          frames.results.map(async (f) => ({
            slot: f.slot,
            ownerTag: await relayOwnerTag(id, f.who),
            mine: f.who === viewer,
            v: f.updated_at,
          })),
        ),
      })
    }

    const rawBody = await readLimitedBody(request, MAX_CREATE_BODY)
    if (!rawBody) return fail(413, 'Data terlalu besar.')
    const body = parseJsonBody<{
      key?: unknown
      meta?: unknown
      slots?: unknown
      perPerson?: unknown
    }>(rawBody) ?? {}
    if (typeof body.key !== 'string' || !/^[\w-]{16,64}$/.test(body.key)) return fail(400, 'Kunci tidak valid.')
    const owner = await sha256Hex(body.key)

    if (request.method === 'DELETE') {
      const r = await live(db, id)
      if (!r || r.owner_hash !== owner) return fail(403, 'Bukan pembuat estafet ini.')
      await db.batch([db.prepare('DELETE FROM relay_frames WHERE relay_id = ?1').bind(id), db.prepare('DELETE FROM relays WHERE id = ?1').bind(id)])
      return json({ ok: true })
    }

    if (request.method === 'POST') {
      const slots = Number(body.slots)
      const per = Number(body.perPerson)
      if (!Number.isInteger(slots) || slots < 1 || slots > MAX_SLOTS) return fail(400, 'Jumlah frame tidak valid.')
      if (!Number.isInteger(per) || per < 1 || per > slots) return fail(400, 'Jatah per orang tidak valid.')
      if (typeof body.meta !== 'string' || body.meta.length > MAX_META) return fail(400, 'Data tidak valid.')
      const now = Date.now()
      await purgeRelays(db, now)
      const res = await db
        .prepare('INSERT OR IGNORE INTO relays (id, owner_hash, meta, slots, per_person, created_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)')
        .bind(id, owner, fromB64(body.meta), slots, per, now, now + RELAY_TTL_MS)
        .run()
      if (!res.meta.changes) return fail(409, 'Estafet ini sudah ada.')
      return json({ ok: true, expiresAt: now + RELAY_TTL_MS })
    }
    return fail(405, 'Metode tidak didukung.')
  }

  // ---------------------------------------------------------------- satu frame
  const slot = Number(slotPart)
  const r = await live(db, id)
  if (!r) return fail(404, 'Estafet sudah berakhir atau tidak ada.', 'gone')
  if (!Number.isInteger(slot) || slot < 0 || slot >= r.slots) return fail(400, 'Frame tidak valid.')

  if (request.method === 'GET') {
    const f = await db.prepare('SELECT photo FROM relay_frames WHERE relay_id = ?1 AND slot = ?2').bind(id, slot).first<{ photo: ArrayBuffer }>()
    if (!f) return fail(404, 'Frame masih kosong.')
    return new Response(new Uint8Array(f.photo as ArrayBuffer), { headers: { 'content-type': 'application/octet-stream', 'cache-control': 'no-store' } })
  }

  const who = request.headers.get('X-Who') ?? ''
  if (!/^[0-9a-f]{64}$/.test(who)) return fail(400, 'Identitas tidak valid.')

  if (request.method === 'DELETE') {
    const removed = await db.prepare('DELETE FROM relay_frames WHERE relay_id = ?1 AND slot = ?2 AND who = ?3').bind(id, slot, who).run()
    if (!removed.meta.changes) return fail(404, 'Frame kosong atau bukan milikmu.', 'forbidden')
    return json({ ok: true })
  }

  if (request.method === 'PUT') {
    const photo = await readLimitedBody(request, MAX_FRAME)
    if (!photo) return fail(413, 'Foto terlalu besar.')
    if (!photo.byteLength) return fail(400, 'Foto kosong.')
    // Decide the per-person allowance and claim the slot in one statement to prevent concurrent over-claims.
    const res = await db
      .prepare(
        `INSERT INTO relay_frames (relay_id, slot, who, photo, updated_at)
         SELECT ?1, ?2, ?3, ?4, ?5
         WHERE (SELECT COUNT(*) FROM relay_frames WHERE relay_id = ?1 AND who = ?3 AND slot != ?2) < ?6
           AND NOT EXISTS (SELECT 1 FROM relay_frames WHERE relay_id = ?1 AND slot = ?2 AND who != ?3)
         ON CONFLICT (relay_id, slot) DO UPDATE SET photo = ?4, updated_at = ?5 WHERE relay_frames.who = ?3`,
      )
      .bind(id, slot, who, photo.buffer, Date.now(), r.per_person)
      .run()
    if (!res.meta.changes) {
      const existing = await db.prepare('SELECT who FROM relay_frames WHERE relay_id = ?1 AND slot = ?2').bind(id, slot).first<{ who: string }>()
      if (existing && existing.who !== who) return fail(409, 'Frame itu sudah diisi teman.', 'taken')
      return fail(403, `Jatahmu ${r.per_person} frame sudah terpakai.`, 'quota')
    }
    return json({ ok: true })
  }
  return fail(405, 'Metode tidak didukung.')
}

