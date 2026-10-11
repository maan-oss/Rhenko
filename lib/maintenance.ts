import { all, run } from "@/lib/db"
import { notify } from "@/lib/notify"
import { publishDue } from "@/lib/post-writes"
import { expireStaleCalls } from "@/lib/call-state"
import { sweepLimits } from "@/lib/rate-limit"
import { RETENTION } from "@/lib/legal"
import { purgeHidden } from "@/lib/moderation"

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
  // Hidden posts whose appeal window has closed, or whose appeal failed, are deleted here.
  purgeHidden(now)
  if (now - lastRetentionPass >= HOUR) {
    lastRetentionPass = now
    keepWithinRetention(now)
  }
  sweepLimits(now)
}

// Records are kept only as long as the Privacy Policy says. Views and profile visits 90 days, read notifications 180
// days, and notices about content three years. Checked once an hour: the deletes are cheap, but there is no need for
// them every tick.
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
let lastRetentionPass = 0

function keepWithinRetention(now: number): void {
  run("DELETE FROM post_views WHERE created_at < ?", now - RETENTION.viewsDays * DAY)
  run("DELETE FROM profile_visits WHERE created_at < ?", now - RETENTION.visitsDays * DAY)
  run("DELETE FROM notifications WHERE read = 1 AND created_at < ?", now - RETENTION.readNotificationsDays * DAY)
  run("DELETE FROM legal_notices WHERE created_at < ?", now - RETENTION.legalNoticesDays * DAY)
  run("DELETE FROM moderation_notices WHERE created_at < ?", now - RETENTION.legalNoticesDays * DAY)
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
