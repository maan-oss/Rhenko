// Unit checks for polls sent in a chat (lib/poll-rules.ts): what the composer's poll may say, how a stored poll reads back,
// and which choices a vote may name. Run with: npm run test:unit

import { test } from "node:test"
import assert from "node:assert/strict"
import { parsePollAttachment, pollInput, pollVoteInput } from "../lib/poll-rules.ts"

const options = [
  { id: "a", label: "Tea" },
  { id: "b", label: "Coffee" },
  { id: "c", label: "Water" },
]

test("a poll needs a question and at least two choices, blanks dropped", () => {
  assert.deepEqual(pollInput({ question: " Lunch?  ", choices: ["Pizza", "", "  ", "Soup"], multiple: false }), {
    ok: true,
    question: "Lunch?",
    choices: ["Pizza", "Soup"],
    multiple: false,
  })
  assert.equal(pollInput({ question: "  ", choices: ["a", "b"], multiple: false }).ok, false)
  assert.equal(pollInput({ question: "Lunch?", choices: ["Pizza", " "], multiple: false }).ok, false)
})

test("a poll's choices are capped and must be different", () => {
  const twelve = Array.from({ length: 12 }, (_, index) => `Choice ${index + 1}`)
  assert.equal(pollInput({ question: "Pick", choices: twelve, multiple: true }).ok, true)
  assert.equal(pollInput({ question: "Pick", choices: [...twelve, "Extra"], multiple: true }).ok, false)
  const repeated = pollInput({ question: "Pick", choices: ["Tea", "tea"], multiple: false })
  assert.equal(repeated.ok, false)
})

test("text is limited in length and stripped of control characters", () => {
  assert.equal(pollInput({ question: "x".repeat(256), choices: ["a", "b"], multiple: false }).ok, false)
  assert.equal(pollInput({ question: "x".repeat(255), choices: ["a", "b"], multiple: false }).ok, true)
  assert.equal(pollInput({ question: "Hi\u0007\nthere", choices: ["a", "b"], multiple: false }).question, "Hi there")
  assert.equal(pollInput({ question: "Pick", choices: ["y".repeat(101), "b"], multiple: false }).ok, false)
})

test("a malformed poll is refused", () => {
  assert.equal(pollInput(null).ok, false)
  assert.equal(pollInput({ question: "Pick", choices: "a,b", multiple: false }).ok, false)
  assert.equal(pollInput({ question: "Pick", choices: ["a", "b"], multiple: "yes" }).ok, false)
  assert.equal(pollInput({ question: "Pick", choices: [1, 2], multiple: false }).ok, false)
})

test("a stored poll reads back with its choices and answer type", () => {
  const stored = { kind: "poll", question: "Lunch?", multiple: true, options: [{ id: "a", label: "Pizza" }, { id: "b", label: "Soup" }] }
  assert.deepEqual(parsePollAttachment(stored), { question: "Lunch?", options: [{ id: "a", label: "Pizza" }, { id: "b", label: "Soup" }], multiple: true })
  assert.equal(parsePollAttachment({ ...stored, options: [{ id: "a", label: "Pizza" }] }), null)
  assert.equal(parsePollAttachment({ ...stored, options: [{ id: "a", label: "Pizza" }, { id: "a", label: "Soup" }] }), null)
  assert.equal(parsePollAttachment({ ...stored, multiple: "no" }), null)
})

test("a single-answer vote names one choice, and an empty vote takes it back", () => {
  assert.deepEqual(pollVoteInput(["a"], options, false), { ok: true, choices: ["a"] })
  assert.deepEqual(pollVoteInput([], options, false), { ok: true, choices: [] })
  assert.equal(pollVoteInput(["a", "b"], options, false).ok, false)
})

test("a multiple-answer vote names several choices, each once, all in this poll", () => {
  assert.deepEqual(pollVoteInput(["a", "c"], options, true), { ok: true, choices: ["a", "c"] })
  assert.equal(pollVoteInput(["a", "a"], options, true).ok, false)
  assert.equal(pollVoteInput(["a", "zz"], options, true).ok, false)
  assert.equal(pollVoteInput("a", options, true).ok, false)
})
