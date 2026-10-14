// Unit checks for the human check's rules in lib/proof-rules.ts: how a puzzle's leading zero bits are counted, how hard a
// puzzle is for a network, and the shape of the proof and form-time stamp a browser sends back.
// Run with: npm run test:unit

import { test } from "node:test"
import assert from "node:assert/strict"
import {
  BASE_BITS,
  FORM_MAX_MS,
  FORM_MIN_MS,
  MAX_BITS,
  MIN_BITS,
  bitsFor,
  clampBits,
  formTimeOk,
  leadingZeroBits,
  meetsDifficulty,
  parseAnswer,
  parseStamp,
  turnstileAccepted,
} from "../lib/proof-rules.ts"

const ID = "a".repeat(32)
const DIGEST = "b".repeat(64)

test("leading zero bits count from the front of the digest", () => {
  assert.equal(leadingZeroBits("0000ffff"), 16)
  assert.equal(leadingZeroBits("0001"), 15)
  assert.equal(leadingZeroBits("0008"), 12)
  assert.equal(leadingZeroBits("0040"), 9)
  assert.equal(leadingZeroBits("8000"), 0)
  assert.equal(leadingZeroBits("00ab"), 8)
  assert.equal(leadingZeroBits(""), 0)
  // A character that is not hex stops the count where it is.
  assert.equal(leadingZeroBits("0g00"), 4)
})

test("a digest meets a difficulty when it has at least that many zero bits", () => {
  assert.equal(meetsDifficulty("00ab", 8), true)
  assert.equal(meetsDifficulty("00ab", 9), false)
  assert.equal(meetsDifficulty("ffff", 0), true)
})

test("a network that asks for many puzzles gets a harder one, within limits", () => {
  assert.equal(bitsFor(0), BASE_BITS)
  assert.equal(bitsFor(9), BASE_BITS)
  assert.equal(bitsFor(10), BASE_BITS + 2)
  assert.equal(bitsFor(40), BASE_BITS + 4)
  assert.equal(bitsFor(0, 30), MAX_BITS)
  assert.equal(bitsFor(0, 2), MIN_BITS)
  assert.equal(clampBits(1000), MAX_BITS)
  assert.equal(clampBits(-5), MIN_BITS)
})

test("a proof answer is accepted only in the shape the check sends", () => {
  assert.deepEqual(parseAnswer(JSON.stringify({ kind: "pow", id: ID, nonce: "k3j9" })), { kind: "pow", id: ID, nonce: "k3j9" })
  assert.deepEqual(parseAnswer(JSON.stringify({ kind: "turnstile", token: "t".repeat(40) })), { kind: "turnstile", token: "t".repeat(40) })

  assert.equal(parseAnswer(undefined), null)
  assert.equal(parseAnswer(""), null)
  assert.equal(parseAnswer("not json"), null)
  assert.equal(parseAnswer(JSON.stringify({ kind: "pow", id: "short", nonce: "k3j9" })), null)
  assert.equal(parseAnswer(JSON.stringify({ kind: "pow", id: ID, nonce: "UPPER" })), null)
  assert.equal(parseAnswer(JSON.stringify({ kind: "pow", id: ID, nonce: "x".repeat(25) })), null)
  assert.equal(parseAnswer(JSON.stringify({ kind: "turnstile", token: "" })), null)
  assert.equal(parseAnswer(JSON.stringify({ kind: "other", id: ID })), null)
  assert.equal(parseAnswer(JSON.stringify([])), null)
})

test("a form's start time stamp splits into time and signature, and nothing else passes", () => {
  assert.deepEqual(parseStamp(`1767225600000.${DIGEST}`), { time: "1767225600000", signature: DIGEST })
  assert.equal(parseStamp(`1767225600000${DIGEST}`), null)
  assert.equal(parseStamp(`12.${DIGEST}`), null)
  assert.equal(parseStamp(`1767225600000.abc`), null)
  assert.equal(parseStamp(`abcdefghij.${DIGEST}`), null)
  assert.equal(parseStamp(null), null)
})

test("a form must take longer than a person needs, and not be older than the stamp allows", () => {
  const start = 1_000_000
  assert.equal(formTimeOk(start, start + FORM_MIN_MS - 1), false)
  assert.equal(formTimeOk(start, start + FORM_MIN_MS), true)
  assert.equal(formTimeOk(start, start + FORM_MAX_MS), true)
  assert.equal(formTimeOk(start, start + FORM_MAX_MS + 1), false)
})

test("Turnstile counts as passed only on an explicit success", () => {
  assert.equal(turnstileAccepted({ success: true }), true)
  assert.equal(turnstileAccepted({ success: false }), false)
  assert.equal(turnstileAccepted({ success: "true" }), false)
  assert.equal(turnstileAccepted({}), false)
  assert.equal(turnstileAccepted(null), false)
})
