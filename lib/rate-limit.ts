// Fixed-window request limits, kept in the database so that every server process shares one count. Each check is a single
// statement, so two processes checking at the same moment cannot both take the last attempt of a window.
import { get, run } from "@/lib/db"

export type LimitResult = { ok: true } | { ok: false; retryAfterSeconds: number }

// Counts one attempt under `key`. At most `limit` attempts are allowed in each `windowMs`. The count is only raised while
// the window has room, so a refused attempt counts for nothing.
export function consume(key: string, limit: number, windowMs: number, now = Date.now()): LimitResult {
  const counted = get<{ reset_at: number }>(
    `INSERT INTO rate_limits (limit_key, hits, reset_at) VALUES (?1, 1, ?2)
     ON CONFLICT(limit_key) DO UPDATE SET
       hits = CASE WHEN rate_limits.reset_at <= ?3 THEN 1 ELSE rate_limits.hits + 1 END,
       reset_at = CASE WHEN rate_limits.reset_at <= ?3 THEN ?2 ELSE rate_limits.reset_at END
     WHERE rate_limits.reset_at <= ?3 OR rate_limits.hits < ?4
     RETURNING reset_at`,
    key,
    now + windowMs,
    now,
    limit
  )
  if (counted) return { ok: true }
  const current = get<{ reset_at: number }>("SELECT reset_at FROM rate_limits WHERE limit_key = ?", key)
  const resetAt = current?.reset_at ?? now + windowMs
  return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)) }
}

// Whether `limit` attempts are already counted under `key` in the current window. Counts nothing.
export function reached(key: string, limit: number, now = Date.now()): boolean {
  const current = get<{ hits: number; reset_at: number }>("SELECT hits, reset_at FROM rate_limits WHERE limit_key = ?", key)
  return current !== undefined && current.reset_at > now && current.hits >= limit
}

// Drops windows that have ended, so the table stays small.
export function sweepLimits(now = Date.now()): void {
  run("DELETE FROM rate_limits WHERE reset_at <= ?", now)
}

// A readable wait, such as "about 5 minutes" or "30 seconds".
export function waitLabel(seconds: number): string {
  if (seconds < 90) return `${seconds} second${seconds === 1 ? "" : "s"}`
  const minutes = Math.ceil(seconds / 60)
  return `about ${minutes} minute${minutes === 1 ? "" : "s"}`
}
