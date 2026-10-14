// Unit checks for the account risk score in lib/account-risk.ts and the disposable-email list in lib/disposable-domains.ts.
// The thresholds decide who is asked for a human check and who is held back, so each level is pinned here.
// Run with: npm run test:unit

import { test } from "node:test"
import assert from "node:assert/strict"
import { CHALLENGE_AT, RESTRICT_AT, assessAccount } from "../lib/account-risk.ts"
import { isDisposableEmail } from "../lib/disposable-domains.ts"

// An account a person made long ago, with a confirmed email and a profile, and nothing unusual.
const CLEAN = {
  accountAgeHours: 24 * 400,
  emailVerified: true,
  emptyProfile: false,
  trailingDigits: 0,
  sameNetworkAccounts: 0,
  followsLastHour: 0,
  followsLastDay: 0,
  likesLastHour: 0,
  repostsLastHour: 0,
  newChatsLastHour: 0,
  reporters30Days: 0,
  spamNotices: 0,
  isBot: false,
}

test("a clean, established account is left alone", () => {
  assert.deepEqual(assessAccount(CLEAN), { score: 0, level: "ok", reasons: [] })
})

test("a brand new account that has not confirmed an email is asked for the check, not restricted", () => {
  const verdict = assessAccount({ ...CLEAN, accountAgeHours: 2, emailVerified: false, emptyProfile: true, trailingDigits: 8 })
  assert.ok(verdict.score >= CHALLENGE_AT, `score ${verdict.score} should reach the challenge line`)
  assert.ok(verdict.score < RESTRICT_AT, `score ${verdict.score} should stay below the restrict line`)
  assert.equal(verdict.level, "challenge")
})

test("a shared network can ask for the check, but never restricts an account on its own", () => {
  const verdict = assessAccount({ ...CLEAN, accountAgeHours: 2, emailVerified: false, sameNetworkAccounts: 30 })
  assert.equal(verdict.level, "challenge")
  assert.ok(verdict.reasons.includes("was made from a network that made many other accounts"))
})

test("reports from several people and a removed spam post restrict a new account", () => {
  const verdict = assessAccount({ ...CLEAN, accountAgeHours: 2, emailVerified: false, reporters30Days: 8, spamNotices: 1 })
  assert.equal(verdict.level, "restrict")
})

test("a follow flood is challenged, and only the highest tier of one signal counts", () => {
  const flood = assessAccount({ ...CLEAN, followsLastHour: 60 })
  assert.equal(flood.level, "challenge")
  assert.equal(flood.score, 50)
  // A rate just over the first line adds only that tier's points.
  assert.equal(assessAccount({ ...CLEAN, followsLastHour: 35 }).score, 35)
})

test("a bot account is never scored, so Sahayak is not challenged", () => {
  assert.deepEqual(assessAccount({ ...CLEAN, isBot: true, accountAgeHours: 1, emailVerified: false, sameNetworkAccounts: 9 }), {
    score: 0,
    level: "ok",
    reasons: [],
  })
})

test("the score never exceeds 100", () => {
  const verdict = assessAccount({
    ...CLEAN,
    accountAgeHours: 1,
    emailVerified: false,
    emptyProfile: true,
    trailingDigits: 9,
    sameNetworkAccounts: 20,
    followsLastHour: 500,
    likesLastHour: 900,
    newChatsLastHour: 50,
    reporters30Days: 30,
    spamNotices: 3,
  })
  assert.equal(verdict.score, 100)
  assert.equal(verdict.level, "restrict")
})

test("disposable mail providers are refused, including their subdomains", () => {
  assert.equal(isDisposableEmail("someone@yopmail.com"), true)
  assert.equal(isDisposableEmail("someone@mail.yopmail.com"), true)
  assert.equal(isDisposableEmail("someone@example.com"), false)
  assert.equal(isDisposableEmail("someone@notyopmail.com"), false)
  assert.equal(isDisposableEmail("no-at-sign"), false)
})
