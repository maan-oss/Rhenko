// The For you ranking. Pure: it takes candidates with their counts, times and the viewer's history, and returns them in the
// order to show. Nothing here touches the database. lib/data.ts reads the candidates, and lib/feed-learning.ts refits the
// learned weights from what people did. The tests run this file directly.
//
// A post's value is what the viewer is likely to do with it, worked out in three steps.
//
// 1. Two small logistic models read the same features of the post, as the viewer is shown it. The engage model predicts a
//    like, repost or bookmark. The dwell model predicts that the viewer will keep the post on screen long enough to read it.
//    The value is 0.7 × engage + 0.3 × dwell. Both start from PRIOR, the weights set by hand. Training keeps new weights only
//    when they predict held-out behaviour better than PRIOR does (see fitHead).
// 2. Penalties. A post the viewer has already kept on screen for three seconds counts for a tenth. A post already shown to
//    them in the last three days counts for 15%. A post they have liked, reposted or bookmarked counts for 30%.
// 3. Ordering. Ties go to the newer item. No author takes more than PER_AUTHOR of the top places, and no more than
//    SOURCE_RUN places in a row come from one source, so the list does not turn into one kind of post.

const HOUR = 60 * 60 * 1000

export const RANK_WINDOW_MS = 72 * HOUR
export const HALF_LIFE_MS = 12 * HOUR
export const PER_AUTHOR = 2
export const SOURCE_RUN = 3
// Time on screen at which a post counts as read. A post read this way is pushed well down.
export const DWELL_MS = 3000
// An author with fewer followers than this is a small account. The explore pool and one feature look at them.
export const SMALL_AUTHOR = 300
const ENGAGE_SHARE = 0.7

// Where a candidate came from. When several pools found a post, the first of these in the list is kept.
export const SOURCES = ["follow", "repost", "social", "affinity", "topic", "popular", "explore", "fresh"] as const
export type Source = (typeof SOURCES)[number]

export type Candidate = {
  // "post:<id>" for a post, "repost:<post>:<reposter>" for a repost. Unique within a feed.
  key: string
  postId: string
  authorId: string
  // When the item reached the feed: the post's time, or the repost's time for a repost.
  at: number
  reposterId: string | null
  source: Source
  // The viewer follows the author, or (for a repost) the person who reposted.
  followed: boolean
  // The post uses a hashtag the viewer follows.
  topic: boolean
  likes: number
  reposted: number
  replies: number
  quotes: number
  views: number
  // How many people the viewer follows have liked the post in the last three days.
  socialCount: number
  // How many times the viewer has liked, reposted or bookmarked this author's posts in the last thirty days.
  affinity: number
  authorFollowers: number
  // The post has a web link in it.
  links: boolean
  // Characters in the post's text.
  length: number
  // The post was shown to the viewer in the last three days.
  seen: boolean
  // Milliseconds the viewer has had the post on screen.
  dwelledMs: number
  // The viewer has liked, reposted or bookmarked the post.
  engagedByViewer: boolean
}

// Engagement on a log scale, so the tenth like counts for less than the first. A repost and a quote say more than a like,
// and a reply more than a like. Views count for very little: they are easy to inflate and everyone sees them.
export function engagement(c: Pick<Candidate, "likes" | "reposted" | "replies" | "quotes" | "views">): number {
  const weighted = c.likes + 2 * c.reposted + 2 * c.quotes + 1.5 * c.replies + 0.02 * c.views
  return Math.log2(1 + weighted)
}

export function recencyOf(at: number, now: number): number {
  return Math.pow(0.5, Math.max(0, now - at) / HALF_LIFE_MS)
}

// The features the models read. The order matches FEATURE_NAMES and the weight vectors below.
export const FEATURE_NAMES = [
  "bias",
  "recency",
  "engagement",
  "followed",
  "repostedByFollowed",
  "topic",
  "social",
  "affinity",
  "smallAuthor",
  "authorFollowers",
  "links",
  "length",
  "views",
] as const

export function featuresOf(c: Candidate, now: number): number[] {
  return [
    1,
    recencyOf(c.at, now),
    Math.min(engagement(c) / 8, 2),
    c.followed ? 1 : 0,
    c.reposterId !== null ? 1 : 0,
    c.topic ? 1 : 0,
    Math.min(Math.max(0, c.socialCount), 5) / 5,
    Math.log2(1 + Math.max(0, c.affinity)) / 5,
    c.authorFollowers < SMALL_AUTHOR ? 1 : 0,
    Math.log2(1 + Math.max(0, c.authorFollowers)) / 20,
    c.links ? 1 : 0,
    Math.min(Math.max(0, c.length), 280) / 280,
    Math.log2(1 + Math.max(0, c.views)) / 20,
  ]
}

export type Weights = { engage: number[]; dwell: number[] }

// The hand-set weights, in the order of FEATURE_NAMES. Engagement and a follow weigh most; recency decides how fresh a post
// has to be to compete. A link and a very small account count a little against a post on the engage side.
export const PRIOR: Weights = {
  engage: [-4.0, 2.0, 1.2, 1.0, 0.6, 0.4, 1.4, 1.0, 0.1, 0.2, -0.3, 0.2, 0.2],
  dwell: [-2.0, 1.0, 0.6, 0.4, 0.2, 0.2, 0.4, 0.5, -0.1, 0.0, 0.2, 0.8, 0.3],
}

export function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z))
}

export function predict(weights: number[], x: number[]): number {
  let z = 0
  for (let j = 0; j < weights.length; j++) z += weights[j] * x[j]
  return sigmoid(z)
}

export function score(c: Candidate, now: number, weights: Weights = PRIOR): number {
  const x = featuresOf(c, now)
  let value = ENGAGE_SHARE * predict(weights.engage, x) + (1 - ENGAGE_SHARE) * predict(weights.dwell, x)
  if (c.dwelledMs >= DWELL_MS) value *= 0.1
  if (c.seen) value *= 0.15
  if (c.engagedByViewer) value *= 0.3
  return value
}

// Whether the run of the last SOURCE_RUN places in `head` all come from `source`.
function runsOn(head: Candidate[], source: Source): boolean {
  if (head.length < SOURCE_RUN) return false
  for (let k = 1; k <= SOURCE_RUN; k++) {
    if (head[head.length - k].source !== source) return false
  }
  return true
}

// The candidates in feed order, best first, with at most `limit` of them. Ties go to the newer item, then to the key, so the
// same inputs always give the same order.
export function rank(candidates: Candidate[], now: number, limit: number, weights: Weights = PRIOR): Candidate[] {
  const order = candidates
    .map((candidate) => ({ candidate, value: score(candidate, now, weights) }))
    .sort((a, b) => b.value - a.value || b.candidate.at - a.candidate.at || (a.candidate.key < b.candidate.key ? -1 : a.candidate.key > b.candidate.key ? 1 : 0))
  const position = new Map(order.map((entry, index) => [entry.candidate.key, index]))

  const head: Candidate[] = []
  const taken = new Map<string, number>()
  // Waiting for a source run to end, and over the author limit: both come after the head, in score order.
  const blocked: Candidate[] = []
  const later: Candidate[] = []
  const authorCount = (id: string) => taken.get(id) ?? 0
  const take = (c: Candidate) => {
    head.push(c)
    taken.set(c.authorId, authorCount(c.authorId) + 1)
  }
  // After each pick, the first waiting candidate that fits goes in, so a blocked post is delayed, not dropped.
  const releaseBlocked = () => {
    let progressed = true
    while (progressed) {
      progressed = false
      for (let i = 0; i < blocked.length; i++) {
        const c = blocked[i]
        if (authorCount(c.authorId) >= PER_AUTHOR) {
          later.push(...blocked.splice(i, 1))
          i--
          continue
        }
        if (!runsOn(head, c.source)) {
          take(blocked.splice(i, 1)[0])
          progressed = true
          break
        }
      }
    }
  }

  for (const { candidate } of order) {
    if (authorCount(candidate.authorId) >= PER_AUTHOR) later.push(candidate)
    else if (runsOn(head, candidate.source)) blocked.push(candidate)
    else {
      take(candidate)
      releaseBlocked()
    }
  }
  const rest = [...blocked, ...later].sort((a, b) => (position.get(a.key) ?? 0) - (position.get(b.key) ?? 0))
  return [...head, ...rest].slice(0, limit)
}

// ---------------------------------------------------------------------------------------------------------------------
// Learning. The engage and dwell models are refit from what people did after each post was shown. These functions do the
// fitting and the check. A new fit replaces PRIOR only when it wins on the held-out part of the history, and only with
// enough data to tell a real difference from noise.
// ---------------------------------------------------------------------------------------------------------------------

export type Example = { x: number[]; y: boolean }

export const MIN_TRAIN = 500
export const MIN_HOLDOUT = 100
export const MIN_POSITIVES = 30
// A held-out log loss must beat the hand-set weights by at least this much.
export const MIN_GAIN = 0.001

export type Fit = {
  weights: number[]
  accepted: boolean
  samples: number
  positives: number
  priorLoss: number
  holdoutLoss: number
}

export function logloss(weights: number[], examples: Example[]): number {
  if (examples.length === 0) return 0
  let total = 0
  for (const e of examples) {
    const p = Math.min(Math.max(predict(weights, e.x), 1e-6), 1 - 1e-6)
    total += e.y ? -Math.log(p) : -Math.log(1 - p)
  }
  return total / examples.length
}

// Full-batch gradient descent on the log loss, pulled gently toward the prior so a few noisy examples cannot move a weight far.
function descend(examples: Example[], prior: number[], iterations = 250, rate = 0.25, pull = 0.001): number[] {
  const w = prior.slice()
  if (examples.length === 0) return w
  const grad = new Array<number>(w.length)
  for (let step = 0; step < iterations; step++) {
    grad.fill(0)
    for (const e of examples) {
      const err = predict(w, e.x) - (e.y ? 1 : 0)
      for (let j = 0; j < w.length; j++) grad[j] += err * e.x[j]
    }
    for (let j = 0; j < w.length; j++) w[j] -= rate * (grad[j] / examples.length + pull * (w[j] - prior[j]))
  }
  return w
}

export function fitHead(train: Example[], holdout: Example[], prior: number[]): Fit {
  const positives = train.filter((e) => e.y).length
  const fitted = descend(train, prior)
  const priorLoss = logloss(prior, holdout)
  const holdoutLoss = logloss(fitted, holdout)
  const accepted =
    train.length >= MIN_TRAIN && holdout.length >= MIN_HOLDOUT && positives >= MIN_POSITIVES && holdoutLoss < priorLoss - MIN_GAIN
  return { weights: accepted ? fitted : prior.slice(), accepted, samples: train.length, positives, priorLoss, holdoutLoss }
}

// Splits history sorted oldest first: the older part trains, the newer part checks. A time split, not a random one, so the
// check is on behaviour the model did not see while it was being fitted.
export function splitHoldout<T>(items: T[], share = 0.8): { train: T[]; holdout: T[] } {
  const cut = Math.floor(items.length * share)
  return { train: items.slice(0, cut), holdout: items.slice(cut) }
}
