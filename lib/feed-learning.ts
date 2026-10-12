// What the For you feed learns from, and the learning itself.
//
//   feed_impressions  a post put in someone's For you: where it came from, and the features the model saw. One row per viewer
//                     and post, so a post shown again only moves its time.
//   post_dwell        the milliseconds someone has had a post on screen, added up. The app sends this every few seconds.
//   feed_hides        posts someone marked "Not interested". They are left out of that person's For you.
//
// Once an hour the models are refit (trainFeedModel) from impressions old enough for what happened next to be known: the
// likes, reposts, bookmarks and dwell in the three days after a post was shown. The fit is kept only when it beats the
// hand-set weights on the newer part of that history (fitHead in lib/ranking.ts).
import { all, run, transaction } from "@/lib/db"
import { RETENTION } from "@/lib/legal"
import { DWELL_MS, fitHead, PRIOR, splitHoldout, type Example, type Fit, type Source, type Weights } from "@/lib/ranking"

const DAY = 24 * 60 * 60 * 1000
// How long after a post was shown an action still counts as its result.
const LABEL_MS = 3 * DAY
// How far back the training looks.
const TRAIN_MS = 14 * DAY
// Impressions and dwell are kept this long, as the Privacy Policy says.
const KEEP_MS = RETENTION.feedSignalsDays * DAY
const MAX_EXAMPLES = 50_000
const WEIGHTS_CACHE_MS = 5 * 60 * 1000

let cached: { at: number; weights: Weights } | null = null

// The weights the feed uses: the fitted ones where a fit was accepted, the hand-set ones otherwise. A row that is missing,
// unreadable or the wrong length leaves its model on the hand-set weights, so a bad row can never break the feed.
export function modelWeights(): Weights {
  const now = Date.now()
  if (cached && now - cached.at < WEIGHTS_CACHE_MS) return cached.weights
  const weights: Weights = { engage: PRIOR.engage, dwell: PRIOR.dwell }
  try {
    for (const row of all<{ name: string; weights: string }>("SELECT name, weights FROM feed_model WHERE accepted = 1")) {
      const values: unknown = JSON.parse(row.weights)
      if (!Array.isArray(values) || values.length !== PRIOR.engage.length || !values.every((v) => typeof v === "number" && Number.isFinite(v))) continue
      if (row.name === "engage") weights.engage = values as number[]
      if (row.name === "dwell") weights.dwell = values as number[]
    }
  } catch (error) {
    console.error("[feed] could not read the model weights, using the hand-set ones", error)
  }
  cached = { at: now, weights }
  return weights
}

// Records the posts the For you feed just showed. A failure here is logged and never stops the feed.
export function recordImpressions(viewerId: string, served: { postId: string; source: Source; features: number[] }[], now: number): void {
  if (served.length === 0) return
  try {
    transaction(() => {
      for (const s of served) {
        const features = JSON.stringify(s.features.map((v) => Math.round(v * 10000) / 10000))
        run(
          `INSERT INTO feed_impressions (viewer_id, post_id, source, features, served_at) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(viewer_id, post_id) DO UPDATE SET source = excluded.source, features = excluded.features, served_at = excluded.served_at`,
          viewerId,
          s.postId,
          s.source,
          features,
          now
        )
      }
    })
  } catch (error) {
    console.error("[feed] could not record impressions", error)
  }
}

// The posts shown to this viewer since `since`.
export function recentlyServed(viewerId: string, since: number): Set<string> {
  return new Set(all<{ post_id: string }>("SELECT post_id FROM feed_impressions WHERE viewer_id = ? AND served_at >= ?", viewerId, since).map((r) => r.post_id))
}

// Milliseconds each post has been on this viewer's screen, for posts whose dwell was last added to since `since`.
export function dwellSince(viewerId: string, since: number): Map<string, number> {
  return new Map(all<{ post_id: string; dwell_ms: number }>("SELECT post_id, dwell_ms FROM post_dwell WHERE viewer_id = ? AND updated_at >= ?", viewerId, since).map((r) => [r.post_id, r.dwell_ms] as const))
}

export function hiddenPosts(viewerId: string): Set<string> {
  return new Set(all<{ post_id: string }>("SELECT post_id FROM feed_hides WHERE viewer_id = ?", viewerId).map((r) => r.post_id))
}

export type TrainingReport = { examples: number; engage: Fit; dwell: Fit }

// Refits both models from the history that has matured (served between TRAIN_MS and LABEL_MS ago). Every fit is stored with
// its numbers, accepted or not, so the outcome can be seen.
export function trainFeedModel(now: number): TrainingReport {
  const rows = all<{ features: string; engaged: number; dwelled: number }>(
    `SELECT i.features,
       (EXISTS (SELECT 1 FROM likes l WHERE l.user_id = i.viewer_id AND l.post_id = i.post_id AND l.created_at >= i.served_at AND l.created_at < i.served_at + ?)
        OR EXISTS (SELECT 1 FROM reposts r WHERE r.user_id = i.viewer_id AND r.post_id = i.post_id AND r.created_at >= i.served_at AND r.created_at < i.served_at + ?)
        OR EXISTS (SELECT 1 FROM bookmarks b WHERE b.user_id = i.viewer_id AND b.post_id = i.post_id AND b.created_at >= i.served_at AND b.created_at < i.served_at + ?)) AS engaged,
       EXISTS (SELECT 1 FROM post_dwell d WHERE d.viewer_id = i.viewer_id AND d.post_id = i.post_id AND d.dwell_ms >= ? AND d.updated_at >= i.served_at) AS dwelled
     FROM feed_impressions i
     WHERE i.served_at >= ? AND i.served_at <= ?
     ORDER BY i.served_at DESC LIMIT ?`,
    LABEL_MS,
    LABEL_MS,
    LABEL_MS,
    DWELL_MS,
    now - TRAIN_MS,
    now - LABEL_MS,
    MAX_EXAMPLES
  )

  // Oldest first, so the time split is a real one.
  const examples: { x: number[]; engaged: boolean; dwelled: boolean }[] = []
  for (const row of rows.reverse()) {
    let x: unknown
    try {
      x = JSON.parse(row.features)
    } catch {
      continue
    }
    // A row written under an older feature list cannot be used with the current one.
    if (!Array.isArray(x) || x.length !== PRIOR.engage.length) continue
    examples.push({ x: x as number[], engaged: row.engaged === 1, dwelled: row.dwelled === 1 })
  }

  const { train, holdout } = splitHoldout(examples)
  const toExample = (y: (e: (typeof examples)[number]) => boolean) => (e: (typeof examples)[number]): Example => ({ x: e.x, y: y(e) })
  const engage = fitHead(train.map(toExample((e) => e.engaged)), holdout.map(toExample((e) => e.engaged)), PRIOR.engage)
  const dwell = fitHead(train.map(toExample((e) => e.dwelled)), holdout.map(toExample((e) => e.dwelled)), PRIOR.dwell)

  transaction(() => {
    save("engage", engage, now)
    save("dwell", dwell, now)
  })
  cached = null
  return { examples: examples.length, engage, dwell }
}

function save(name: string, fit: Fit, now: number): void {
  run(
    `INSERT INTO feed_model (name, weights, accepted, samples, positives, prior_loss, holdout_loss, trained_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET weights = excluded.weights, accepted = excluded.accepted, samples = excluded.samples,
       positives = excluded.positives, prior_loss = excluded.prior_loss, holdout_loss = excluded.holdout_loss, trained_at = excluded.trained_at`,
    name,
    JSON.stringify(fit.weights),
    fit.accepted ? 1 : 0,
    fit.samples,
    fit.positives,
    fit.priorLoss,
    fit.holdoutLoss,
    now
  )
}

// Removes impressions and dwell too old to learn from. Hides stay until the viewer or the post goes away.
export function purgeFeedSignals(now: number): void {
  run("DELETE FROM feed_impressions WHERE served_at < ?", now - KEEP_MS)
  run("DELETE FROM post_dwell WHERE updated_at < ?", now - KEEP_MS)
}
