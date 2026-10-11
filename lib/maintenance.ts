import { all, run } from "@/lib/db"
import { notify } from "@/lib/notify"
import { publishDue } from "@/lib/post-writes"
import { expireStaleCalls } from "@/lib/call-state"
import { sweepLimits } from "@/lib/rate-limit"

// Background work that does not wait for anyone to open a page: scheduled posts go live on time, polls announce
// their results, calls that have stopped answering end, and expired sessions and codes are removed.
const TICK_MS = 15_000

type Globals = { __rhenkoMaintenance?: ReturnType<typeof setInterval> }
const globals = globalThis as unknown as Globals

export function startMaintenance(): void {
  if (globals.__rhenkoMaintenance) return
  globals.__rhenkoMaintenance = setInterval(() => {
    try {
      runMaintenance()
    } catch (error) {
      console.error("[maintenance] pass failed", error)
    }
  }, TICK_MS)
  globals.__rhenkoMaintenance.unref?.()
  runMaintenance()
}

export function runMaintenance(now = Date.now()): void {
  publishDue(now)
  announceEndedPolls(now)
  expireStaleCalls(now)
  run("DELETE FROM sessions WHERE expires_at < ?", now)
  run("DELETE FROM login_challenges WHERE expires_at < ?", now)
  run("DELETE FROM email_codes WHERE expires_at < ?", now)
  sweepLimits(now)
}

// Tells everyone who voted in a poll that it has ended, once.
function announceEndedPolls(now: number): void {
  const ended = all<{ post_id: string; author_id: string }>(
    `SELECT pl.post_id, p.author_id FROM polls pl
     JOIN posts p ON p.id = pl.post_id
     WHERE pl.ends_at <= ? AND pl.notified_at IS NULL AND p.is_draft = 0 AND p.publish_at IS NULL`,
    now
  )
  for (const poll of ended) {
    const voters = all<{ user_id: string }>("SELECT user_id FROM poll_votes WHERE post_id = ?", poll.post_id)
    for (const voter of voters) notify(voter.user_id, poll.author_id, "poll", poll.post_id)
    run("UPDATE polls SET notified_at = ? WHERE post_id = ?", now, poll.post_id)
  }
}
