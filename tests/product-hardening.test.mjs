import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { claimStripQuota } from '../worker/quota.ts'
import { parseJsonBody, readLimitedBody } from '../worker/body.ts'
import { relayRequest } from '../worker/relay.ts'
import { useBooth } from '../src/store.ts'

class SqliteD1 {
  constructor() {
    this.sqlite = new DatabaseSync(':memory:')
  }

  prepare(sql) {
    const sqlite = this.sqlite
    return {
      bind(...values) {
        const normalized = values.map((value) => value instanceof ArrayBuffer ? new Uint8Array(value) : value)
        return {
          async first() {
            return sqlite.prepare(sql).get(...normalized) ?? null
          },
          async all() {
            return { results: sqlite.prepare(sql).all(...normalized) }
          },
          async run() {
            const result = sqlite.prepare(sql).run(...normalized)
            return { meta: { changes: Number(result.changes) } }
          },
        }
      },
    }
  }

  async batch(statements) {
    const results = []
    for (const statement of statements) results.push(await statement.run())
    return results
  }

  close() {
    this.sqlite.close()
  }
}

const databases = []
function database() {
  const db = new SqliteD1()
  databases.push(db)
  return db
}

afterEach(() => {
  for (const db of databases.splice(0)) db.close()
  useBooth.getState().restore(useBooth.getState().design, [], 'test-strip', null, [])
})

describe('bounded Worker request bodies', () => {
  it('parses valid JSON and rejects an oversized streamed body', async () => {
    const valid = parseJsonBody(new TextEncoder().encode('{"id":"strip-12345678"}'))
    expect(valid).toEqual({ id: 'strip-12345678' })

    const oversized = await readLimitedBody(new Request('https://photobooth.test/api/rooms/x', {
      method: 'PUT',
      body: new Uint8Array(33),
    }), 32)
    expect(oversized).toBeNull()
  })
})

describe('daily strip quota', () => {
  it('claims only five free strips under parallel requests and keeps repeated claims idempotent', async () => {
    const db = database()
    db.sqlite.exec(readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8'))
    const ids = Array.from({ length: 12 }, (_, i) => `strip-${String(i).padStart(8, '0')}`)

    const claims = await Promise.all(ids.map((id) => claimStripQuota(db, 'user-1', id, '2026-10-24', 5, 1)))
    expect(claims.filter((claim) => !claim.watermark)).toHaveLength(5)
    expect(claims.filter((claim) => claim.watermark)).toHaveLength(7)

    const repeated = await claimStripQuota(db, 'user-1', ids[0], '2026-10-24', 5, 2)
    expect(repeated).toMatchObject({ watermark: false, quota: { used: 5, limit: 5 } })
    const count = db.sqlite.prepare('SELECT COUNT(*) AS n FROM strips WHERE user_sub = ?').get('user-1').n
    expect(count).toBe(12)
  })
})

describe('relay ownership and frame limits', () => {
  it('does not overwrite or falsely delete another owner frame and hides raw owner IDs', async () => {
    const db = database()
    db.sqlite.exec(readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8'))
    db.sqlite.exec(readFileSync(new URL('../migrations/0003_relays.sql', import.meta.url), 'utf8'))
    const id = 'a'.repeat(64)
    const ownerKey = 'owner-key-with-at-least-16-chars'
    const ownerA = '1'.repeat(64)
    const ownerB = '2'.repeat(64)
    const base = `https://photobooth.test/api/relays/${id}`
    const env = { DB: db }
    const call = (request, slot) => relayRequest(request, new URL(request.url), env, id, slot)

    const created = await call(new Request(base, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: ownerKey, meta: 'e30=', slots: 2, perPerson: 1 }),
    }))
    expect(created.status).toBe(200)

    const uploaded = await call(new Request(`${base}/frames/0`, { method: 'PUT', headers: { 'X-Who': ownerA }, body: new Uint8Array([4, 5, 6]) }), '0')
    expect(uploaded.status).toBe(200)
    const overwrite = await call(new Request(`${base}/frames/0`, { method: 'PUT', headers: { 'X-Who': ownerB }, body: new Uint8Array([7]) }), '0')
    expect(overwrite.status).toBe(409)
    const falseDelete = await call(new Request(`${base}/frames/0`, { method: 'DELETE', headers: { 'X-Who': ownerB } }), '0')
    expect(falseDelete.status).toBe(404)

    const frame = await call(new Request(`${base}/frames/0`), '0')
    expect([...new Uint8Array(await frame.arrayBuffer())]).toEqual([4, 5, 6])
    const info = await call(new Request(base, { headers: { 'X-Who': ownerB } }))
    const payload = await info.text()
    expect(payload).not.toContain(ownerA)
    expect(payload).not.toContain(ownerB)
    expect(JSON.parse(payload).frames[0]).toMatchObject({ mine: false, ownerTag: expect.stringMatching(/^owner:/) })
  })

  it('enforces the per-person relay allowance during concurrent frame uploads', async () => {
    const db = database()
    db.sqlite.exec(readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8'))
    db.sqlite.exec(readFileSync(new URL('../migrations/0003_relays.sql', import.meta.url), 'utf8'))
    const id = 'b'.repeat(64)
    const ownerKey = 'owner-key-with-at-least-16-chars'
    const owner = '3'.repeat(64)
    const base = `https://photobooth.test/api/relays/${id}`
    const env = { DB: db }
    const call = (request, slot) => relayRequest(request, new URL(request.url), env, id, slot)

    await call(new Request(base, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: ownerKey, meta: 'e30=', slots: 3, perPerson: 1 }),
    }))
    const responses = await Promise.all([1, 2].map((slot) =>
      call(new Request(`${base}/frames/${slot}`, { method: 'PUT', headers: { 'X-Who': owner }, body: new Uint8Array([slot]) }), String(slot)),
    ))

    expect(responses.filter((response) => response.status === 200)).toHaveLength(1)
    expect(responses.filter((response) => response.status === 403)).toHaveLength(1)
    const count = db.sqlite.prepare('SELECT COUNT(*) AS n FROM relay_frames WHERE relay_id = ?').get(id).n
    expect(count).toBe(1)
  })

  it('rejects an oversized encrypted frame before storing it', async () => {
    const db = database()
    db.sqlite.exec(readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8'))
    db.sqlite.exec(readFileSync(new URL('../migrations/0003_relays.sql', import.meta.url), 'utf8'))
    const id = 'c'.repeat(64)
    const ownerKey = 'owner-key-with-at-least-16-chars'
    const base = `https://photobooth.test/api/relays/${id}`
    const env = { DB: db }
    const call = (request, slot) => relayRequest(request, new URL(request.url), env, id, slot)

    await call(new Request(base, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: ownerKey, meta: 'e30=', slots: 1, perPerson: 1 }),
    }))
    const response = await call(new Request(`${base}/frames/0`, {
      method: 'PUT',
      headers: { 'X-Who': '4'.repeat(64) },
      body: new Uint8Array(1_900_001),
    }), '0')

    expect(response.status).toBe(413)
    expect(db.sqlite.prepare('SELECT COUNT(*) AS n FROM relay_frames WHERE relay_id = ?').get(id).n).toBe(0)
  })
})

describe('photo and editor state recovery', () => {
  it('restores hidden spare photos when the user switches to a larger layout', () => {
    const state = useBooth.getState()
    const photos = Array.from({ length: 6 }, (_, i) => ({ id: `photo-${i}`, img: {}, source: 'upload' }))
    state.restore({ ...state.design, layoutId: 'grid-6' }, photos, 'same-strip', null)

    useBooth.getState().setLayout('strip-3')
    expect(useBooth.getState().photos.map((photo) => photo?.id)).toEqual(['photo-0', 'photo-1', 'photo-2'])
    expect(useBooth.getState().sparePhotos.map((photo) => photo?.id)).toEqual(['photo-3', 'photo-4', 'photo-5'])

    useBooth.getState().setLayout('grid-6')
    expect(useBooth.getState().photos.map((photo) => photo?.id)).toEqual(photos.map((photo) => photo.id))
    expect(useBooth.getState().sparePhotos).toEqual([])
  })

  it('undoes layout changes without losing hidden photos', () => {
    const state = useBooth.getState()
    const photos = Array.from({ length: 6 }, (_, i) => ({ id: `undo-photo-${i}`, img: {}, source: 'upload' }))
    state.restore({ ...state.design, layoutId: 'grid-6' }, photos, 'same-strip', null)
    useBooth.getState().setLayout('strip-3')

    useBooth.getState().undo()
    expect(useBooth.getState().design.layoutId).toBe('grid-6')
    expect(useBooth.getState().photos.map((photo) => photo?.id)).toEqual(photos.map((photo) => photo.id))
    expect(useBooth.getState().sparePhotos).toEqual([])

    useBooth.getState().redo()
    expect(useBooth.getState().design.layoutId).toBe('strip-3')
    expect(useBooth.getState().sparePhotos.map((photo) => photo?.id)).toEqual(['undo-photo-3', 'undo-photo-4', 'undo-photo-5'])
  })

  it('coalesces a drag into one undo step, supports redo, and clears redo after a new edit', () => {
    const store = useBooth.getState()
    store.restore({ ...store.design, overlays: [] }, [], 'strip-history', null)
    const id = useBooth.getState().addOverlay({ kind: 'text', text: 'Halo', x: 0.5, y: 0.5, size: 0.1, rot: 0 })

    useBooth.getState().beginOverlayTransaction()
    useBooth.getState().updateOverlay(id, { x: 0.6 })
    useBooth.getState().updateOverlay(id, { x: 0.7 })
    useBooth.getState().updateOverlay(id, { x: 0.8 })
    useBooth.getState().endOverlayTransaction()
    expect(useBooth.getState().overlayUndoStack).toHaveLength(2)

    useBooth.getState().undo()
    expect(useBooth.getState().design.overlays[0].x).toBe(0.5)
    expect(useBooth.getState().canUndo).toBe(true)
    useBooth.getState().redo()
    expect(useBooth.getState().design.overlays[0].x).toBe(0.8)

    useBooth.getState().updateOverlay(id, { x: 0.9 })
    expect(useBooth.getState().canRedo).toBe(false)
  })

  it('tracks non-overlay design edits and caps history at fifty entries', () => {
    const state = useBooth.getState()
    state.restore({ ...state.design, footerText: null }, [], 'strip-design', null)
    useBooth.getState().setDesign({ footerText: 'Satu' })
    useBooth.getState().setDesign({ footerText: 'Dua' })
    useBooth.getState().undo()
    expect(useBooth.getState().design.footerText).toBe('Satu')
    expect(useBooth.getState().canUndo).toBe(true)
    useBooth.getState().redo()
    expect(useBooth.getState().design.footerText).toBe('Dua')

    for (let i = 0; i < 60; i++) useBooth.getState().setDesign({ footerText: `Edit ${i}` })
    expect(useBooth.getState().overlayUndoStack).toHaveLength(50)
  })
})
