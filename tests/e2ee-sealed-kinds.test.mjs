// Unit checks for the other kinds of encrypted message: a contact, a place and a poll. A poll's stored copy names only its choices' ids
// and neutral placeholder labels, never the question or the words of a choice, and its votes are counted against those ids. Run with:
// npm run test:unit

import { test } from "node:test"
import assert from "node:assert/strict"
import { parsePayload } from "../lib/e2ee-payload.ts"
import { SEALED_POLL_QUESTION, parsePollAttachment, pollVoteInput, sealedPollAttachment } from "../lib/poll-rules.ts"

const ID_A = "0b1c2d3e-4f50-4617-8829-3a4b5c6d7e8f"
const ID_B = "1c2d3e4f-5061-4728-993a-4b5c6d7e8f90"

test("a contact, a place and a poll each parse as the payload they are", () => {
  assert.deepEqual(parsePayload({ kind: "contact", body: "", userId: "user-1" }), { kind: "contact", body: "", userId: "user-1" })
  assert.deepEqual(parsePayload({ kind: "location", body: "here", lat: 12.5, lng: 77.1 }), {
    kind: "location",
    body: "here",
    lat: 12.5,
    lng: 77.1,
  })
  const poll = parsePayload({
    kind: "poll",
    body: "",
    question: "Lunch?",
    options: [
      { id: ID_A, label: "Pizza" },
      { id: ID_B, label: "Soup" },
    ],
    multiple: false,
  })
  assert.equal(poll.kind, "poll")
  assert.equal(poll.question, "Lunch?")
  assert.deepEqual(
    poll.options.map((option) => option.label),
    ["Pizza", "Soup"]
  )
})

test("a place outside the globe, a contact with no account, and a poll with too few or repeated choices are refused", () => {
  assert.equal(parsePayload({ kind: "location", body: "", lat: 91, lng: 0 }), null)
  assert.equal(parsePayload({ kind: "location", body: "", lat: 0, lng: 181 }), null)
  assert.equal(parsePayload({ kind: "contact", body: "", userId: "" }), null)
  assert.equal(
    parsePayload({ kind: "poll", body: "", question: "Lunch?", options: [{ id: ID_A, label: "Pizza" }], multiple: false }),
    null
  )
  assert.equal(
    parsePayload({
      kind: "poll",
      body: "",
      question: "Lunch?",
      options: [
        { id: ID_A, label: "Pizza" },
        { id: ID_A, label: "Soup" },
      ],
      multiple: false,
    }),
    null
  )
  assert.equal(
    parsePayload({
      kind: "poll",
      body: "",
      question: "",
      options: [
        { id: ID_A, label: "Pizza" },
        { id: ID_B, label: "Soup" },
      ],
      multiple: false,
    }),
    null
  )
})

test("a sealed poll's stored copy names its choices by id only, under placeholders", () => {
  const stored = sealedPollAttachment([ID_A, ID_B], false)
  assert.equal(stored.question, SEALED_POLL_QUESTION)
  assert.deepEqual(stored.options, [
    { id: ID_A, label: "Choice 1" },
    { id: ID_B, label: "Choice 2" },
  ])
  assert.equal(stored.multiple, false)
})

test("a sealed poll's stored copy reads back as a poll, so its votes are counted against its choices", () => {
  const parsed = parsePollAttachment(sealedPollAttachment([ID_A, ID_B], true))
  assert.ok(parsed, "the stored copy is a well-formed poll")
  assert.equal(parsed.multiple, true)
  assert.deepEqual(pollVoteInput([ID_A, ID_B], parsed.options, true), { ok: true, choices: [ID_A, ID_B] })
  assert.equal(pollVoteInput([ID_A, ID_B], parsed.options, false).ok, false)
  assert.equal(pollVoteInput(["not-a-choice"], parsed.options, true).ok, false)
})

test("a sealed poll with too few, too many, repeated or non-text choices, or a bad answer type, is refused", () => {
  assert.equal(sealedPollAttachment([ID_A], false), null)
  assert.equal(sealedPollAttachment([ID_A, ID_A], false), null)
  assert.equal(sealedPollAttachment([ID_A, 3], false), null)
  assert.equal(sealedPollAttachment([ID_A, ID_B], "yes"), null)
  assert.equal(
    sealedPollAttachment(
      Array.from({ length: 13 }, (_, index) => `choice-${index}`),
      false
    ),
    null
  )
})
