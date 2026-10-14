// Leases pick one server process at a time to do work that must not run twice, such as the maintenance pass. The holder
// renews the lease while it works. If it stops, the lease runs out and another process takes it. The lease lives in the
// database, so every process sees the same holder.
import { change, get } from "@/lib/db"
import { WORKER_ID } from "@/lib/worker"

// True when this process holds the lease `name` now, after taking it or renewing it. A holder renews once half of `ttlMs`
// has gone by, so the lease is not written on every check.
export function holdLease(name: string, ttlMs: number, now = Date.now()): boolean {
  const current = get<{ holder: string; expires_at: number }>("SELECT holder, expires_at FROM leases WHERE name = ?", name)
  if (current?.holder === WORKER_ID && current.expires_at - now > ttlMs / 2) return true
  const taken = change(
    `INSERT INTO leases (name, holder, expires_at) VALUES (?1, ?2, ?3)
     ON CONFLICT(name) DO UPDATE SET holder = ?2, expires_at = ?3
     WHERE leases.expires_at <= ?4 OR leases.holder = ?2`,
    name,
    WORKER_ID,
    now + ttlMs,
    now
  )
  return taken > 0
}
