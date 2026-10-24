/** Claim one daily free strip without allowing concurrent downloads to share the same last slot. */
export async function claimStripQuota(db: D1Database, userSub: string, stripId: string, day: string, limit: number, now: number) {
  const existing = await db
    .prepare('SELECT free FROM strips WHERE user_sub = ?1 AND strip_id = ?2')
    .bind(userSub, stripId)
    .first<{ free: number }>()

  let free: boolean
  if (existing) {
    free = existing.free === 1
  } else {
    // Decide and insert in one SQLite statement so parallel strip IDs cannot both claim the last free slot.
    await db.prepare(
      'INSERT OR IGNORE INTO strips (user_sub, day, strip_id, free, created_at) SELECT ?1, ?2, ?3, CASE WHEN (SELECT COUNT(*) FROM strips WHERE user_sub = ?1 AND day = ?2 AND free = 1) < ?4 THEN 1 ELSE 0 END, ?5',
    ).bind(userSub, day, stripId, limit, now).run()
    const claimed = await db
      .prepare('SELECT free FROM strips WHERE user_sub = ?1 AND strip_id = ?2')
      .bind(userSub, stripId)
      .first<{ free: number }>()
    if (!claimed) return null
    free = claimed.free === 1
  }

  const usage = await db
    .prepare('SELECT COUNT(*) AS n FROM strips WHERE user_sub = ?1 AND day = ?2 AND free = 1')
    .bind(userSub, day)
    .first<{ n: number }>()
  return { watermark: !free, quota: { used: usage?.n ?? 0, limit } }
}
