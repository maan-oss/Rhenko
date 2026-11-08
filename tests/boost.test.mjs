// Unit checks for boosts: what a boosted post's ad says, what may not be boosted, what a budget buys, and the labels on the
// advertiser's pages. Run with: npm run test:unit

import { test } from "node:test"
import assert from "node:assert/strict"
import { BOOST_BODY_MAX, BOOST_BUDGETS, CAMPAIGN_STATUS_LABEL, MICRO_PER_CENT, boostCopy, boostViews, impressionCostMicro } from "../lib/ad-rules.ts"

const SITE = "https://rhenko.example"
const POST_ID = "0c1d2e3f-4a5b-4c6d-8e7f-901234567890"
const post = (text) => ({ text, handle: "maan", postId: POST_ID })

test("the boost amounts are whole amounts, from low to high", () => {
  assert.deepEqual(BOOST_BUDGETS, [...BOOST_BUDGETS].sort((a, b) => a - b))
  assert.ok(BOOST_BUDGETS.every((amount) => Number.isInteger(amount) && amount >= 5))
})

test("a post with too little text cannot be boosted", () => {
  assert.ok("problem" in boostCopy(post("hi"), SITE))
})

test("a long post's ad shows its start in the headline and its own words in the body, cut at the limit", () => {
  const text = "A long post about bread and the slow way to make it. ".repeat(40)
  const made = boostCopy(post(text), SITE)
  assert.ok("copy" in made)
  assert.ok([...made.copy.headline].length <= 60)
  assert.ok(made.copy.headline.endsWith("…"))
  assert.ok([...made.copy.body].length <= BOOST_BODY_MAX)
  assert.ok(made.copy.body.startsWith("A long post about bread"))
  assert.ok(made.copy.body.endsWith("…"))
  assert.equal(made.copy.cta, "View post")
  assert.equal(made.copy.link, `${SITE}/maan/status/${POST_ID}`)
})

test("a short post's ad keeps the post's own words and its line breaks", () => {
  const made = boostCopy(post("Bread takes time.\nWorth the wait, every loaf."), SITE)
  assert.ok("copy" in made)
  assert.equal(made.copy.body, "Bread takes time.\nWorth the wait, every loaf.")
})

test("the policy screen reads the whole post, not only the part the ad shows", () => {
  const text = "Lovely bread recipes for everyone, every single week. ".repeat(3) + "Vote for the candidate who bakes."
  assert.deepEqual(boostCopy(post(text), SITE), { problem: "Political ads are not allowed." })
})

test("a budget buys at most its share of views at the current price, and more budget buys more views", () => {
  assert.equal(boostViews(10), Math.floor((10 * 100 * MICRO_PER_CENT) / impressionCostMicro()))
  assert.ok(boostViews(50) > boostViews(5))
})

test("every campaign status has a label on the advertiser's pages", () => {
  assert.deepEqual(Object.keys(CAMPAIGN_STATUS_LABEL).sort(), ["active", "ended", "in_review", "paused", "rejected"])
  assert.ok(Object.values(CAMPAIGN_STATUS_LABEL).every((label) => label.length > 0))
})
