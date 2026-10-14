// Fixed-window request limits, kept in memory. Counts reset when the server restarts. One server
// process shares one count; several servers would each keep their own.

type Window = { count: number; resetAt: number }
type Globals = { __rhenkoLimits?: Map<string, Window> }
const globals = globalThis as unknown as Globals

function table(): Map<string, Window> {
  if (!globals.__rhenkoLimits) globals.__rhenkoLimits = new Map()
  return globals.__rhenkoLimits
}

export type LimitResult = { ok: true } | { ok: false; retryAfterSeconds: number }

// Counts one attempt under `key`. At most `limit` attempts are allowed in each `windowMs`.
export function consume(key: string, limit: number, windowMs: number, now = Date.now()): LimitResult {
  const limits = table()
  const current = limits.get(key)
  if (!current || current.resetAt <= now) {
    limits.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true }
  }
  if (current.count >= limit) {
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) }
  }
  current.count += 1
  return { ok: true }
}

// Whether `limit` attempts are already counted under `key` in the current window. Counts nothing.
export function reached(key: string, limit: number, now = Date.now()): boolean {
  const current = table().get(key)
  return current !== undefined && current.resetAt > now && current.count >= limit
}

// Drops windows that have ended, so the table stays small.
export function sweepLimits(now = Date.now()): void {
  const limits = table()
  for (const [key, window] of limits) {
    if (window.resetAt <= now) limits.delete(key)
  }
}

// A readable wait, such as "about 5 minutes" or "30 seconds".
export function waitLabel(seconds: number): string {
  if (seconds < 90) return `${seconds} second${seconds === 1 ? "" : "s"}`
  const minutes = Math.ceil(seconds / 60)
  return `about ${minutes} minute${minutes === 1 ? "" : "s"}`
}
