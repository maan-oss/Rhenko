// Unit checks for the chat features that pin, select, remind and set alerts: how a chat's notification level comes from its two
// flags, which members a message reaches, what a reminder time and a bulk selection may be, and what a reminder says in a push.
// Run with: npm run test:unit

import { test } from "node:test"
import assert from "node:assert/strict"
import {
  BULK_MESSAGES_MAX,
  PINNED_MESSAGES_MAX,
  REMINDER_MAX_MS,
  alertFlags,
  alertLevel,
  alertLevelInput,
  messageIdsInput,
  reachesMember,
  reminderInput,
} from "../lib/chat-message-rules.ts"
import { reminderPush } from "../lib/notify-rules.ts"

const NOW = 1_800_000_000_000
const HOUR = 60 * 60 * 1000

test("a chat's level comes from its two flags, and silenced wins", () => {
  assert.equal(alertLevel(0, 0), "all")
  assert.equal(alertLevel(1, 0), "mentions")
  assert.equal(alertLevel(0, 1), "none")
  assert.equal(alertLevel(1, 1), "none")
})

test("choosing a level stores flags that read back as the same level", () => {
  for (const level of ["all", "mentions", "none"]) {
    const flags = alertFlags(level)
    assert.equal(alertLevel(flags.muted, flags.silenced), level)
  }
})

test("mentions get past a muted chat, and nothing gets past a silenced one", () => {
  assert.equal(reachesMember("all", false), true)
  assert.equal(reachesMember("mentions", false), false)
  assert.equal(reachesMember("mentions", true), true)
  assert.equal(reachesMember("none", true), false)
  assert.equal(reachesMember("none", false), false)
})

test("an alert level is one of the three choices, and nothing else", () => {
  assert.deepEqual(alertLevelInput("all"), { ok: true, level: "all" })
  assert.deepEqual(alertLevelInput("mentions"), { ok: true, level: "mentions" })
  assert.deepEqual(alertLevelInput("none"), { ok: true, level: "none" })
  assert.equal(alertLevelInput("loud").ok, false)
  assert.equal(alertLevelInput(undefined).ok, false)
})

test("a reminder must be a whole time later than now, and within a year", () => {
  assert.deepEqual(reminderInput(NOW + HOUR, NOW), { ok: true, at: NOW + HOUR })
  assert.deepEqual(reminderInput(NOW + REMINDER_MAX_MS, NOW), { ok: true, at: NOW + REMINDER_MAX_MS })
  assert.equal(reminderInput(NOW, NOW).ok, false)
  assert.equal(reminderInput(NOW - 1, NOW).ok, false)
  assert.equal(reminderInput(NOW + REMINDER_MAX_MS + 1, NOW).ok, false)
  assert.equal(reminderInput(NOW + 0.5, NOW).ok, false)
  assert.equal(reminderInput("1800000000000", NOW).ok, false)
  assert.equal(reminderInput(Number.NaN, NOW).ok, false)
})

test("a bulk selection is plain message ids, unique, at least one and at most the limit", () => {
  assert.deepEqual(messageIdsInput(["a1", "b_2", "a1"]), { ok: true, ids: ["a1", "b_2"] })
  // Entries that aren't plain ids are dropped rather than sent on.
  assert.deepEqual(messageIdsInput(["a1", "../x", 7, "", null]), { ok: true, ids: ["a1"] })
  assert.equal(messageIdsInput([]).ok, false)
  assert.equal(messageIdsInput(["../x"]).ok, false)
  assert.equal(messageIdsInput("a1").ok, false)
  const many = Array.from({ length: BULK_MESSAGES_MAX + 1 }, (_, index) => `m${index}`)
  assert.equal(messageIdsInput(many).ok, false)
  assert.equal(messageIdsInput(many.slice(0, BULK_MESSAGES_MAX)).ok, true)
})

test("a chat holds a few pins, and the limit is small enough to keep the header short", () => {
  assert.equal(PINNED_MESSAGES_MAX, 3)
})

test("a reminder's push names the sender and shows the words only with previews on", () => {
  const withPreview = reminderPush({ conversationId: "c1", messageId: "m9", senderName: "Asha", preview: "  Call me back  ", previewsOn: true })
  assert.equal(withPreview.title, "Reminder")
  assert.equal(withPreview.body, "Asha: Call me back")
  assert.equal(withPreview.url, "/messages/c1?m=m9")
  assert.equal(withPreview.tag, "reminder:m9")
  assert.equal(withPreview.renotify, true)

  const without = reminderPush({ conversationId: "c1", messageId: "m9", senderName: "Asha", preview: "Call me back", previewsOn: false })
  assert.equal(without.body, "A message from Asha")
  assert.doesNotMatch(without.body, /Call me back/)
})

test("a reminder's push encodes an odd conversation id in its link", () => {
  const push = reminderPush({ conversationId: "a b/c", messageId: "x&y", senderName: "Ola", preview: "", previewsOn: true })
  assert.equal(push.url, "/messages/a%20b%2Fc?m=x%26y")
})
