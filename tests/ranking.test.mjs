// Unit checks for the For you ranking in lib/ranking.ts. Run with: npm run test:unit

import { test } from "node:test"
import assert from "node:assert/strict"
import { rank, score, engagement, PER_AUTHOR, HALF_LIFE_MS } from "../lib/ranking.ts"

const NOW = Date.UTC(2026, 9, 12, 12, 0, 0)
const HOUR = 60 * 60 * 1000

function post(id, author, overrides = {}) {
  return {
    key: `post:${id}`,
    postId: id,
    authorId: author,
    at: NOW - HOUR,
    reposterId: null,
    followed: false,
    topic: false,
    likes: 0,
    reposted: 0,
    replies: 0,
    quotes: 0,
    views: 0,
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

test("a newer post scores higher than an older one with the same engagement", () => {
  const fresh = score(post("a", "x", { at: NOW - HOUR, likes: 5 }), NOW)
  const older = score(post("b", "y", { at: NOW - 24 * HOUR, likes: 5 }), NOW)
  assert.ok(fresh > older)
})

test("recency halves every half-life", () => {
  const now = score(post("a", "x", { at: NOW, likes: 5 }), NOW)
  const later = score(post("b", "y", { at: NOW - HALF_LIFE_MS, likes: 5 }), NOW)
  assert.ok(Math.abs(later / now - 0.5) < 1e-9)
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

test("ties go to the newer item, then to the key", () => {
  const older = post("a", "x", { at: NOW - 2 * HOUR })
  const newer = post("b", "y", { at: NOW - HOUR })
  // Both have no engagement and no boosts, so the recency decides.
  assert.deepEqual(rank([older, newer], NOW, 2).map((c) => c.postId), ["b", "a"])
})
