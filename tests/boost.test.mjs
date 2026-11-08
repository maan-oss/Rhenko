// Unit checks for boosts: what a boosted post's ad says, and what may not be boosted. Run with: npm run test:unit

import { test } from "node:test"
import assert from "node:assert/strict"
import { BOOST_BUDGETS, boostCopy } from "../lib/ad-rules.ts"

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

test("a long post's ad shows its start, names the author, and links to the post", () => {
  const made = boostCopy(post("A long post about bread and the slow way to make it. ".repeat(5)), SITE)
  assert.ok("copy" in made)
  assert.ok([...made.copy.headline].length <= 60)
  assert.ok(made.copy.headline.endsWith("…"))
  assert.match(made.copy.body, /@maan/)
  assert.equal(made.copy.cta, "View post")
  assert.equal(made.copy.link, `${SITE}/maan/status/${POST_ID}`)
})

test("the policy screen reads the whole post, not only the part the ad shows", () => {
  const text = "Lovely bread recipes for everyone, every single week. ".repeat(3) + "Vote for the candidate who bakes."
  assert.deepEqual(boostCopy(post(text), SITE), { problem: "Political ads are not allowed." })
})
