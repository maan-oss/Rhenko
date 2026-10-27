// Unit checks for a chat export's text (lib/chat-export.ts): one line per message in UTC, media named and not included, the
// words of a deleted or edited message, and a note when older messages were left out. Run with: npm run test:unit

import { test } from "node:test"
import assert from "node:assert/strict"
import { chatExportText, exportContent, exportFileName } from "../lib/chat-export.ts"

const AT = Date.UTC(2026, 9, 27, 14, 5, 9)

function message(overrides = {}) {
  return {
    createdAt: AT,
    senderName: "Asha",
    body: "",
    editedAt: null,
    deleted: false,
    viewOnce: false,
    hasMedia: false,
    attachment: null,
    callOutcome: null,
    timerChange: null,
    ...overrides,
  }
}

test("a text message reads as its words", () => {
  assert.equal(exportContent(message({ body: "Hello\nthere" })), "Hello\nthere")
})

test("an edited message says so", () => {
  assert.equal(exportContent(message({ body: "Fixed", editedAt: AT + 1000 })), "Fixed (edited)")
})

test("a deleted message says it was deleted, whatever it held", () => {
  assert.equal(exportContent(message({ deleted: true, hasMedia: true, attachment: { kind: "document", name: "a.pdf" } })), "This message was deleted.")
})

test("photos and videos are listed, not included", () => {
  assert.equal(exportContent(message({ hasMedia: true })), "<media omitted>")
  assert.equal(exportContent(message({ hasMedia: true, body: "Sunset" })), "<media omitted> Sunset")
  assert.equal(exportContent(message({ hasMedia: true, viewOnce: true })), "<view-once photo or video omitted>")
})

test("a file keeps its name", () => {
  assert.equal(exportContent(message({ hasMedia: true, attachment: { kind: "document", name: "invoice.pdf" } })), "<file: invoice.pdf>")
})

test("a contact, a place and a poll are described in words", () => {
  assert.equal(exportContent(message({ attachment: { kind: "contact", name: "Ben" } })), "<contact card: Ben>")
  assert.equal(exportContent(message({ attachment: { kind: "contact", name: null } })), "<contact card: unavailable>")
  assert.equal(exportContent(message({ attachment: { kind: "location", lat: 12.5, lng: 77.25 } })), "<location: 12.5, 77.25>")
  assert.equal(
    exportContent(message({ attachment: { kind: "poll", question: "Lunch?", options: ["Pizza", "Dal"] } })),
    "Poll: Lunch? (Pizza / Dal)"
  )
})

test("a call and a change to the timer are lines of their own", () => {
  assert.equal(exportContent(message({ callOutcome: "missed" })), "Call (missed).")
  assert.equal(exportContent(message({ timerChange: 86400000 })), "Disappearing messages turned on.")
  assert.equal(exportContent(message({ timerChange: 0 })), "Disappearing messages turned off.")
})

test("the file says the times are UTC and lists each message oldest first", () => {
  const text = chatExportText("Ben", [message({ body: "First" }), message({ body: "Second", senderName: "Ben", createdAt: AT + 60_000 })], false, AT)
  const lines = text.split("\n")
  assert.equal(lines[0], "Chat with Ben")
  assert.match(lines[1], /^Exported 2026-10-27 14:05:09 UTC from Rhenko\.$/)
  assert.match(lines[2], /UTC/)
  assert.equal(lines[4], "[2026-10-27 14:05:09] Asha: First")
  assert.equal(lines[5], "[2026-10-27 14:06:09] Ben: Second")
  assert.doesNotMatch(text, /most recent messages only/)
  assert.ok(text.endsWith("\n"))
})

test("a partial export says older messages are missing", () => {
  const text = chatExportText("Ben", [message({ body: "Latest" })], true, AT)
  assert.match(text, /This export holds the most recent messages only\. Older messages are not included\./)
})

test("a chat with no name still has a header", () => {
  assert.equal(chatExportText("", [], false, AT).split("\n")[0], "Chat with no name")
})

test("the download is named for the day it was made", () => {
  assert.equal(exportFileName(AT), "rhenko-chat-2026-10-27.txt")
})
