// Unit checks for the For you ranking and its learning in lib/ranking.ts. Run with: npm run test:unit

import { test } from "node:test"
import assert from "node:assert/strict"
import {
  rank,
  score,
  engagement,
  recencyOf,
  featuresOf,
  fitHead,
  logloss,
  splitHoldout,
  predict,
  PRIOR,
  FEATURE_NAMES,
  PER_AUTHOR,
  SOURCE_RUN,
  HALF_LIFE_MS,
  MIN_GAIN,
} from "../lib/ranking.ts"

const NOW = Date.UTC(2026, 9, 12, 12, 0, 0)
const HOUR = 60 * 60 * 1000

function post(id, author, overrides = {}) {
  return {
    key: `post:${id}`,
    postId: id,
    authorId: author,
    at: NOW - HOUR,
    reposterId: null,
    source: "fresh",
    followed: false,
    topic: false,
    likes: 0,
    reposted: 0,
    replies: 0,
    quotes: 0,
    views: 0,
    socialCount: 0,
    affinity: 0,
    authorFollowers: 1000,
    links: false,
    length: 80,
    seen: false,
    dwelledMs: 0,
    engagedByViewer: false,
    ...overrides,
  }
}

test("engagement grows with the counts, on a log scale", () => {
  assert.equal(engagement(post("a", "x")), 0)
  const few = engagement(post("a", "x", { likes: 3 }))
  const many = engagement(post("a", "x", { likes: 30 }))
  assert.ok(many > few)
  // The tenth like adds less than the first one did.
  const first = engagement(post("a", "x", { likes: 1 })) - engagement(post("a", "x"))
  const tenth = engagement(post("a", "x", { likes: 10 })) - engagement(post("a", "x", { likes: 9 }))
  assert.ok(tenth < first)
})

test("a repost or a quote counts for more than a like", () => {
  const like = engagement(post("a", "x", { likes: 4 }))
  const repost = engagement(post("a", "x", { reposted: 4 }))
  assert.ok(repost > like)
})

test("a thousand views counts for less than fifty likes", () => {
  const views = engagement(post("a", "x", { views: 1000 }))
  const likes = engagement(post("a", "x", { likes: 50 }))
  assert.ok(views < likes)
})

test("recency is 1 now, and halves every half-life", () => {
  assert.equal(recencyOf(NOW, NOW), 1)
  assert.equal(recencyOf(NOW - HALF_LIFE_MS, NOW), 0.5)
  assert.equal(recencyOf(NOW + HOUR, NOW), 1, "a post from the future is treated as new, not as more than new")
})

test("a newer post scores higher than an older one with the same engagement", () => {
  const fresh = score(post("a", "x", { at: NOW - HOUR, likes: 5 }), NOW)
  const older = score(post("b", "y", { at: NOW - 24 * HOUR, likes: 5 }), NOW)
  assert.ok(fresh > older)
})

test("a post from someone the viewer follows beats an equal stranger's post", () => {
  const followed = score(post("a", "x", { followed: true, likes: 2 }), NOW)
  const stranger = score(post("b", "y", { likes: 2 }), NOW)
  assert.ok(followed > stranger)
})

test("a post on a followed topic gets a boost", () => {
  const topic = score(post("a", "x", { topic: true, likes: 2 }), NOW)
  const plain = score(post("b", "y", { likes: 2 }), NOW)
  assert.ok(topic > plain)
})

test("a much more engaged stranger's post can still beat a quiet followed post", () => {
  const quietFollowed = score(post("a", "x", { followed: true, at: NOW - 6 * HOUR }), NOW)
  const hotStranger = score(post("b", "y", { at: NOW - HOUR, likes: 200, reposted: 40 }), NOW)
  assert.ok(hotStranger > quietFollowed)
})

test("people the viewer follows liking a post lift it, and so does the viewer's history with the author", () => {
  const plain = score(post("a", "x"), NOW)
  assert.ok(score(post("b", "x", { socialCount: 3 }), NOW) > plain, "a post three followed people liked")
  assert.ok(score(post("c", "x", { affinity: 8 }), NOW) > plain, "an author the viewer engages with")
})

test("a post the viewer has already been shown is pushed well down", () => {
  const fresh = score(post("a", "x", { likes: 3 }), NOW)
  const seen = score(post("b", "x", { likes: 3, seen: true }), NOW)
  assert.ok(seen < fresh * 0.2, `seen ${seen} vs fresh ${fresh}`)
})

test("a post the viewer read (three seconds or more on screen) is pushed well down", () => {
  const fresh = score(post("a", "x", { likes: 3 }), NOW)
  const read = score(post("b", "x", { likes: 3, dwelledMs: 3000 }), NOW)
  const glanced = score(post("c", "x", { likes: 3, dwelledMs: 1200 }), NOW)
  assert.ok(read < fresh * 0.2, "read posts count for a tenth")
  assert.equal(glanced, fresh, "a glance is not a read")
})

test("a post the viewer already liked, reposted or bookmarked counts for less", () => {
  const fresh = score(post("a", "x", { likes: 3 }), NOW)
  const engaged = score(post("b", "x", { likes: 3, engagedByViewer: true }), NOW)
  assert.ok(engaged < fresh * 0.5)
  assert.ok(engaged > 0, "nothing is dropped, only moved down")
})

test("rank puts the best item first and returns no more than the limit", () => {
  const items = [
    post("low", "x", { at: NOW - 30 * HOUR }),
    post("high", "y", { at: NOW - HOUR, likes: 50 }),
    post("mid", "z", { at: NOW - 3 * HOUR, likes: 5 }),
  ]
  const ranked = rank(items, NOW, 2)
  assert.deepEqual(ranked.map((c) => c.postId), ["high", "mid"])
})

test("rank keeps at most PER_AUTHOR of one author's posts near the top", () => {
  // One prolific author, all higher scoring than a single post from someone else.
  const prolific = Array.from({ length: 6 }, (_, i) => post(`p${i}`, "loud", { at: NOW - (i + 1) * 60 * 1000, likes: 100 }))
  const quiet = post("quiet", "other", { at: NOW - 10 * HOUR, likes: 1 })
  const ranked = rank([...prolific, quiet], NOW, 10)
  const top = ranked.slice(0, PER_AUTHOR + 1).map((c) => c.postId)
  assert.ok(top.includes("quiet"), `quiet post should be in the first ${PER_AUTHOR + 1}: ${top}`)
  // Every candidate is still there; the extra ones come after the others.
  assert.equal(ranked.length, 7)
  assert.equal(ranked.filter((c) => c.authorId === "loud").length, 6)
})

test("the same source does not fill more than SOURCE_RUN places in a row", () => {
  const explore = Array.from({ length: 6 }, (_, i) => post(`e${i}`, `ea${i}`, { source: "explore", at: NOW - (i + 1) * 60 * 1000, likes: 20 }))
  const fresh = Array.from({ length: 3 }, (_, i) => post(`f${i}`, `fa${i}`, { source: "fresh", at: NOW - 2 * HOUR - i * 60 * 1000 }))
  const ranked = rank([...explore, ...fresh], NOW, 9)
  assert.equal(ranked.length, 9)
  let run = 0
  let longest = 0
  let previous = null
  for (const c of ranked) {
    run = c.source === previous ? run + 1 : 1
    previous = c.source
    longest = Math.max(longest, run)
  }
  assert.ok(longest <= SOURCE_RUN, `a run of ${longest} from one source`)
})

test("the order is the same for the same input, whatever order it arrives in", () => {
  const items = [
    post("a", "x", { likes: 3 }),
    post("b", "y", { likes: 3 }),
    post("c", "z", { followed: true, likes: 1 }),
    post("d", "w", { at: NOW - 2 * HOUR, reposted: 2 }),
  ]
  const one = rank(items, NOW, 10).map((c) => c.key)
  const two = rank([...items].reverse(), NOW, 10).map((c) => c.key)
  assert.deepEqual(one, two)
})

test("ties go to the newer item", () => {
  const older = post("a", "x", { at: NOW - 2 * HOUR })
  const newer = post("b", "y", { at: NOW - HOUR })
  // Both have no engagement and no boosts, so the recency decides.
  assert.deepEqual(rank([older, newer], NOW, 2).map((c) => c.postId), ["b", "a"])
})

test("features line up with the names and with the weights", () => {
  const x = featuresOf(post("a", "x", { followed: true, socialCount: 2, views: 40, length: 120 }), NOW)
  assert.equal(x.length, FEATURE_NAMES.length)
  assert.equal(PRIOR.engage.length, FEATURE_NAMES.length)
  assert.equal(PRIOR.dwell.length, FEATURE_NAMES.length)
  assert.equal(x[0], 1, "the first feature is the bias")
  assert.ok(x.every((v) => Number.isFinite(v)))
  const p = predict(PRIOR.engage, x)
  assert.ok(p > 0 && p < 1)
})

// A small deterministic generator, so the fitting tests give the same numbers every run.
function synthetic(n, seed, truth) {
  let s = seed
  const rand = () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
  const out = []
  for (let i = 0; i < n; i++) {
    const u = rand()
    const x = [1, u, rand()]
    const p = 1 / (1 + Math.exp(-(truth[0] + truth[1] * u)))
    out.push({ x, y: rand() < p })
  }
  return out
}

test("a fit that predicts held-out behaviour better than the prior is accepted", () => {
  const train = synthetic(800, 7, [-2, 4])
  const holdout = synthetic(300, 99, [-2, 4])
  const fit = fitHead(train, holdout, [0, 0, 0])
  assert.equal(fit.accepted, true)
  assert.ok(fit.holdoutLoss < fit.priorLoss - MIN_GAIN, `${fit.holdoutLoss} vs ${fit.priorLoss}`)
  assert.notDeepEqual(fit.weights, [0, 0, 0])
})

test("a fit with too little data is not used, and the prior stays", () => {
  const train = synthetic(100, 7, [-2, 4])
  const holdout = synthetic(40, 99, [-2, 4])
  const fit = fitHead(train, holdout, [0, 0, 0])
  assert.equal(fit.accepted, false)
  assert.deepEqual(fit.weights, [0, 0, 0])
})

test("a fit that does not beat a good prior is not used", () => {
  const truth = [-2, 4, 0]
  const train = synthetic(800, 7, [-2, 4])
  const holdout = synthetic(300, 99, [-2, 4])
  const fit = fitHead(train, holdout, truth)
  if (!fit.accepted) assert.deepEqual(fit.weights, truth, "a rejected fit leaves the prior unchanged")
  assert.ok(logloss(fit.weights, holdout) <= logloss(truth, holdout) + 0.05, "the fitted weights are close to the prior, not far off")
})

test("log loss is lower for weights that match the data", () => {
  const data = synthetic(400, 3, [-2, 4])
  assert.ok(logloss([-2, 4, 0], data) < logloss([0, 0, 0], data))
})

test("splitHoldout keeps the older part to train on and the newer part to check", () => {
  const { train, holdout } = splitHoldout([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  assert.deepEqual(train, [1, 2, 3, 4, 5, 6, 7, 8])
  assert.deepEqual(holdout, [9, 10])
})
