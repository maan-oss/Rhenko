import { all, optimizeDatabase, run } from "@/lib/db"
import { notify } from "@/lib/notify"
import { publishDue } from "@/lib/screening"
import { expireStaleCalls, pruneQueuedBanners } from "@/lib/call-state"
import { sweepBus } from "@/lib/bus"
import { holdLease } from "@/lib/leases"
import { sweepLimits } from "@/lib/rate-limit"
import { RETENTION } from "@/lib/legal"
import { purgeHidden } from "@/lib/moderation"
import { purgeFeedSignals, trainFeedModel } from "@/lib/feed-learning"
import { purgeDismissals } from "@/lib/connections"
import { recordMissingLanguages } from "@/lib/translate"
import { answerQuestions } from "@/lib/sahayak"

// Background work that does not wait for anyone to open a page. Several server processes run this timer. Each tick asks
// the database for the maintenance lease, and only the holder does the shared work: scheduled posts go live on time, polls
// announce their results, and expired sessions and codes are removed. Calls are checked every second, because a ring has
// to end on time. The rest runs every 15 seconds.
const TICK_MS = 1_000
const PASS_MS = 15_000
const LEASE_MS = 20_000
const LEASE_NAME = "maintenance"

type Globals = { __rhenkoMaintenance?: ReturnType<typeof setInterval> }
const globals = globalThis as unknown as Globals

let lastPass = 0
let lastAnswers = 0

export function startMaintenance(): void {
  if (globals.__rhenkoMaintenance) return
  globals.__rhenkoMaintenance = setInterval(tick, TICK_MS)
  globals.__rhenkoMaintenance.unref?.()
  tick()
}

function tick(): void {
  const now = Date.now()
  try {
    if (holdLease(LEASE_NAME, LEASE_MS, now)) {
      expireStaleCalls(now)
      if (now - lastPass >= PASS_MS) {
        lastPass = now
        runMaintenance(now)
      }
    }
  } catch (error) {
    console.error("[maintenance] pass failed", error)
  }
  // Sahayak answers questions as they are asked. This picks up any whose attempt has timed out, or that were waiting. Each
  // question is claimed in the database before it is answered, so every process may run this.
  if (now - lastAnswers >= PASS_MS) {
    lastAnswers = now
    answerQuestions().catch((error) => console.error("[maintenance] Sahayak pass failed", error))
  }
}

export function runMaintenance(now = Date.now()): void {
  publishDue(now)
  announceEndedPolls(now)
  run("DELETE FROM sessions WHERE expires_at < ?", now)
  run("DELETE FROM login_challenges WHERE expires_at < ?", now)
  run("DELETE FROM email_codes WHERE expires_at < ?", now)
  // Hidden posts whose appeal window has closed, or whose appeal failed, are deleted here.
  purgeHidden(now)
  if (now - lastRetentionPass >= HOUR) {
    lastRetentionPass = now
    keepWithinRetention(now)
  }
  // The For you models are refit once an hour from what people did after each post was shown. A failed fit leaves the
  // feed on the weights it has, so it is logged and the rest of the pass goes on.
  if (now - lastLearningPass >= HOUR) {
    lastLearningPass = now
    try {
      trainFeedModel(now)
    } catch (error) {
      console.error("[maintenance] feed model training failed", error)
    }
    purgeFeedSignals(now)
  }
  // Older posts and messages get their language recorded a few at a time, so translation can tell what they are written in.
  recordMissingLanguages(100)
  sweepLimits(now)
  sweepBus(now)
  pruneQueuedBanners(now)
}

// Records are kept only as long as the Privacy Policy says. Views and profile visits 90 days, read notifications 180
// days, and notices about content three years. Checked once an hour: the deletes are cheap, but there is no need for
// them every tick.
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
let lastRetentionPass = 0
let lastLearningPass = 0

function keepWithinRetention(now: number): void {
  // Refreshes the planner's statistics as the tables grow. Cheap, and keeps the feed queries on their indexes.
  optimizeDatabase()
  run("DELETE FROM post_views WHERE created_at < ?", now - RETENTION.viewsDays * DAY)
  purgeDismissals(now)
  run("DELETE FROM profile_visits WHERE created_at < ?", now - RETENTION.visitsDays * DAY)
  run("DELETE FROM notifications WHERE read = 1 AND created_at < ?", now - RETENTION.readNotificationsDays * DAY)
  run("DELETE FROM legal_notices WHERE created_at < ?", now - RETENTION.legalNoticesDays * DAY)
  run("DELETE FROM moderation_notices WHERE created_at < ?", now - RETENTION.legalNoticesDays * DAY)
  run("DELETE FROM sahayak_jobs WHERE finished_at IS NOT NULL AND finished_at < ?", now - RETENTION.sahayakDays * DAY)
  run("DELETE FROM account_signals WHERE created_at < ?", now - RETENTION.signalsDays * DAY)
  // A human-check puzzle is only useful until it expires; a day later it is removed.
  run("DELETE FROM proof_challenges WHERE expires_at < ?", now - DAY)
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
