// Unit checks for the spam scoring in lib/abuse-rules.ts. Run with: npm run test:unit
//
// The corpus is hand-labelled and small (see abuse-corpus.mjs). The train set is what the rules were tuned on, so it
// gates the build: a change that lets a train-set ordinary post be flagged, or drops train-set recall, fails here. The
// holdout and fresh sets are reported, not gated. They show how the rules do on wording they were not tuned on, and the
// numbers are the ones to quote. Do not read a pass on train as an accuracy claim.

import { test } from "node:test"
import assert from "node:assert/strict"
import { assessPost, normalizeForDuplicates, HOLD_AT, LIMIT_AT } from "../lib/abuse-rules.ts"
import { train, holdout, fresh } from "./abuse-corpus.mjs"

const CLEAN = { accountAgeHours: 4000, recentPosts: 0, sameTextBySelf: 0, sameTextOthers: 0, spamNotices: 0, reports: 0 }
const facts = (extra) => ({ ...CLEAN, ...(extra ?? {}) })

function measure(set) {
  let tp = 0, fp = 0, held = 0
  const misses = []
  for (const c of set) {
    const verdict = assessPost(c.body, facts(c.facts))
    const flagged = verdict.action !== "allow"
    const spam = c.label === "spam"
    if (flagged && spam) tp++
    else if (flagged) fp++
    if (verdict.action === "hold" && spam) held++
    if (flagged !== spam) misses.push({ label: c.label, score: verdict.score, action: verdict.action, body: c.body })
  }
  const spamTotal = set.filter((c) => c.label === "spam").length
  return {
    total: set.length,
    spamTotal,
    flaggedSpam: tp,
    flaggedHam: fp,
    precision: tp + fp === 0 ? 1 : tp / (tp + fp),
    recall: spamTotal === 0 ? 1 : tp / spamTotal,
    heldSpam: held,
    misses,
  }
}

test("the scale and the thresholds are in order", () => {
  assert.ok(LIMIT_AT < HOLD_AT)
  assert.ok(HOLD_AT <= 100)
})

test("train set: no ordinary post is flagged", () => {
  const m = measure(train.filter((c) => c.label === "ham"))
  assert.equal(m.flaggedHam, 0, JSON.stringify(m.misses.filter((x) => x.label === "ham"), null, 2))
})

test("train set: most spam is flagged", () => {
  const m = measure(train)
  assert.ok(m.recall >= 0.85, `train recall ${m.recall.toFixed(2)}: ${JSON.stringify(m.misses.filter((x) => x.label === "spam"), null, 2)}`)
  assert.equal(m.flaggedHam, 0)
})

test("a post that pitches money and sends you to a private message is held when the account is also new and repeating", () => {
  const verdict = assessPost("DM me for guaranteed returns! Click the link bit.ly/x1 and claim your reward now, limited slots", facts({ accountAgeHours: 3, sameTextOthers: 6 }))
  assert.equal(verdict.action, "hold")
  assert.ok(verdict.reasons.includes("promises guaranteed returns"))
})

test("an ordinary post with a new account stays allowed", () => {
  const verdict = assessPost("Hi! I am new to Rhenko, say hello if you are around.", facts({ accountAgeHours: 5 }))
  assert.equal(verdict.action, "allow")
})

test("a news link about a pitch word is not limited", () => {
  const verdict = assessPost("Free crypto regulation hearing is on Thursday, here is the agenda: https://www.senate.gov/agenda", facts())
  assert.equal(verdict.action, "allow")
})

test("repeated posting by the same account rises with the count", () => {
  const once = assessPost("Our bakery is open 7 to 3 today.", facts({ sameTextBySelf: 1 }))
  const many = assessPost("Our bakery is open 7 to 3 today.", facts({ sameTextBySelf: 3 }))
  assert.ok(many.score > once.score)
})

test("a flood of posts from one account is flagged on its own", () => {
  const verdict = assessPost("Morning all.", facts({ recentPosts: 70, accountAgeHours: 2 }))
  assert.notEqual(verdict.action, "allow")
})

test("reports and earlier notices raise the score", () => {
  const clean = assessPost("Thoughts on the vote tonight?", facts())
  const reported = assessPost("Thoughts on the vote tonight?", facts({ reports: 8 }))
  const noticed = assessPost("Thoughts on the vote tonight?", facts({ spamNotices: 2 }))
  assert.ok(reported.score > clean.score)
  assert.ok(noticed.score > clean.score)
})

test("the score never goes above 100 and reasons come strongest first", () => {
  const verdict = assessPost("DM me for guaranteed returns, double your bitcoin, claim your reward, free crypto airdrop! https://a.xyz https://b.top https://c.click https://d.site https://bit.ly/zz", facts({ accountAgeHours: 1, spamNotices: 3, reports: 9, sameTextOthers: 9, recentPosts: 90 }))
  assert.equal(verdict.score, 100)
  assert.equal(verdict.action, "hold")
  assert.ok(verdict.reasons.length > 3)
})

test("normalizeForDuplicates ignores links and punctuation, and skips short text", () => {
  assert.equal(normalizeForDuplicates("Big sale!! Visit https://a.example/x now, it is wild."), normalizeForDuplicates("big sale visit now it is wild"))
  assert.equal(normalizeForDuplicates("hi there"), "")
  assert.equal(normalizeForDuplicates(""), "")
})

test("measurements for the report (not gated)", () => {
  const report = {
    train: measure(train),
    holdout: measure(holdout),
    fresh: measure(fresh),
  }
  for (const [name, m] of Object.entries(report)) {
    const line = `${name}: ${m.total} posts, spam recall ${(m.recall * 100).toFixed(0)}% (${m.flaggedSpam}/${m.spamTotal}), ` +
      `ordinary posts flagged ${m.flaggedHam}, precision ${(m.precision * 100).toFixed(0)}%, held spam ${m.heldSpam}`
    console.log(line)
  }
  console.log("fresh misses:")
  for (const miss of report.fresh.misses) console.log(`  ${miss.label} score=${miss.score} ${miss.action}: ${miss.body.slice(0, 70)}`)
  assert.ok(true)
})
