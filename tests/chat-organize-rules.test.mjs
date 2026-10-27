// Unit checks for organising chats (lib/chat-organize-rules.ts): which messages may be forwarded, and what a forward names.
// Run with: npm run test:unit

import { test } from "node:test"
import assert from "node:assert/strict"
import { FORWARD_TARGETS_MAX, PINNED_CHATS_MAX, forwardRefusal, forwardTargetsInput } from "../lib/chat-organize-rules.ts"

const plain = { deleted: false, callStatus: null, timerChange: null, attachmentKind: null }

test("a plain message, photo or file can be forwarded", () => {
  assert.equal(forwardRefusal(plain), null)
  assert.equal(forwardRefusal({ ...plain, attachmentKind: "document" }), null)
  assert.equal(forwardRefusal({ ...plain, attachmentKind: "location" }), null)
})

test("a deleted message, a call record and a timer change are refused", () => {
  assert.match(forwardRefusal({ ...plain, deleted: true }), /deleted/)
  assert.match(forwardRefusal({ ...plain, callStatus: "missed" }), /call/)
  assert.match(forwardRefusal({ ...plain, timerChange: 0 }), /disappearing/)
})

test("a poll is refused, because its votes belong to the original", () => {
  assert.match(forwardRefusal({ ...plain, attachmentKind: "poll" }), /poll/)
})

test("a forward names one to five distinct chats", () => {
  assert.deepEqual(forwardTargetsInput(["a", "b", "a"]), { ok: true, ids: ["a", "b"] })
  assert.equal(forwardTargetsInput([]).ok, false)
  assert.equal(forwardTargetsInput("a").ok, false)
  assert.equal(forwardTargetsInput(["a", 1]).ok, false)
  assert.equal(forwardTargetsInput([""]).ok, false)
  const six = ["1", "2", "3", "4", "5", "6"]
  assert.equal(forwardTargetsInput(six).ok, false)
  assert.equal(forwardTargetsInput(six.slice(0, FORWARD_TARGETS_MAX)).ok, true)
})

test("a person may pin up to three chats", () => {
  assert.equal(PINNED_CHATS_MAX, 3)
})
