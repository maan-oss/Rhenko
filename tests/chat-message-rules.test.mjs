// Unit checks for the messages of a chat (lib/chat-message-rules.ts) and its wallpapers (lib/chat-wallpapers.ts): when a sent
// message can still be edited, what a view-once photo needs, what a search may ask for, and how a hit is shown. Run with:
// npm run test:unit

import { test } from "node:test"
import assert from "node:assert/strict"
import { EDIT_WINDOW_MS, editBodyInput, editRefusal, mentionedHandles, searchQueryInput, snippetAround, viewOnceRefusal } from "../lib/chat-message-rules.ts"
import { WALLPAPERS, wallpaperInput, wallpaperOf } from "../lib/chat-wallpapers.ts"

const SENT = 1_000_000
const sent = { mine: true, deleted: false, callStatus: null, timerChange: null, attachmentKind: null, viewOnce: false, createdAt: SENT }

test("the sender can edit their own text for fifteen minutes", () => {
  assert.equal(EDIT_WINDOW_MS, 15 * 60 * 1000)
  assert.equal(editRefusal(sent, SENT + 1000), null)
  assert.equal(editRefusal(sent, SENT + EDIT_WINDOW_MS), null)
  assert.match(editRefusal(sent, SENT + EDIT_WINDOW_MS + 1), /15 minutes/)
})

test("someone else's message can't be edited", () => {
  assert.match(editRefusal({ ...sent, mine: false }, SENT), /Only the sender/)
})

test("a deleted message, a call record and a change to the timer can't be edited", () => {
  assert.match(editRefusal({ ...sent, deleted: true }, SENT), /deleted/)
  assert.match(editRefusal({ ...sent, callStatus: "missed" }, SENT), /call record/)
  assert.match(editRefusal({ ...sent, timerChange: 0 }, SENT), /disappearing/)
})

test("a poll, a contact or a place is what it is, so it stays as sent", () => {
  for (const kind of ["poll", "contact", "location"]) {
    assert.match(editRefusal({ ...sent, attachmentKind: kind }, SENT), /Only the words/)
  }
  assert.equal(editRefusal({ ...sent, attachmentKind: "document" }, SENT), null, "a file's caption can change")
})

test("a view-once photo can't be edited", () => {
  assert.match(editRefusal({ ...sent, viewOnce: true }, SENT), /view-once/)
})

test("edited words are trimmed, and a message with no photo or video needs some", () => {
  assert.deepEqual(editBodyInput("  hello\r\nthere  ", false, 100), { ok: true, body: "hello\nthere" })
  assert.equal(editBodyInput("   ", false, 100).ok, false)
  assert.deepEqual(editBodyInput("", true, 100), { ok: true, body: "" }, "a photo can lose its caption")
  assert.equal(editBodyInput(12, false, 100).ok, false)
  assert.equal(editBodyInput("abcd", false, 3).ok, false)
  assert.equal(editBodyInput("🙂🙂", false, 2).ok, true, "a limit counts characters, not code units")
})

test("view-once is one photo or video, and never a scan", () => {
  assert.equal(viewOnceRefusal({ requested: false, hasPhoto: false, scan: false }), null)
  assert.equal(viewOnceRefusal({ requested: true, hasPhoto: true, scan: false }), null)
  assert.match(viewOnceRefusal({ requested: true, hasPhoto: true, scan: true }), /scan/)
  assert.match(viewOnceRefusal({ requested: true, hasPhoto: false, scan: false }), /photo or video/)
})

test("a search is tidied, and an empty or very long one is refused", () => {
  assert.deepEqual(searchQueryInput("  lunch \n  plan "), { ok: true, query: "lunch plan" })
  assert.equal(searchQueryInput("   ").ok, false)
  assert.equal(searchQueryInput(undefined).ok, false)
  assert.equal(searchQueryInput("x".repeat(101)).ok, false)
  assert.equal(searchQueryInput("x".repeat(100)).ok, true)
})

test("a search hit shows the match with the words around it", () => {
  const hit = snippetAround("We meet at the station on Friday, bring the plan.", "plan")
  assert.equal(hit.match, "plan")
  assert.equal(hit.after, ".")
  assert.match(hit.before, /bring the $/)
})

test("a long message is cut around the match, with ellipses where it was cut", () => {
  const body = `${"a".repeat(200)} needle ${"b".repeat(200)}`
  const hit = snippetAround(body, "NEEDLE")
  assert.equal(hit.match, "needle")
  assert.ok(hit.before.startsWith("…"))
  assert.ok(hit.after.endsWith("…"))
  assert.ok(hit.before.length + hit.after.length < 130)
})

test("a search that finds nothing in the text shows the start of the message", () => {
  const hit = snippetAround("hello there", "zzz")
  assert.equal(hit.match, "")
  assert.equal(hit.after, "hello there")
})

test("a wallpaper is one the app offers, and anything else is the default", () => {
  assert.equal(WALLPAPERS.length, 5)
  assert.equal(wallpaperInput("dusk"), "dusk")
  assert.equal(wallpaperInput("rainbow"), null)
  assert.equal(wallpaperInput(3), null)
  assert.equal(wallpaperOf(null), "none")
  assert.equal(wallpaperOf("ink"), "ink")
  assert.equal(wallpaperOf("old-value"), "none")
})

test("a mention is an @handle that starts a word: lowercased, once, and never inside an address or a link", () => {
  assert.deepEqual(mentionedHandles("hi @Maan_1 and @maan_1 and @ana"), ["maan_1", "ana"])
  assert.deepEqual(mentionedHandles("@ab is too short but @abc is fine"), ["abc"])
  assert.deepEqual(mentionedHandles("@averyveryverylonghandle can't be one"), [])
  assert.deepEqual(mentionedHandles("(@maan_1) said so"), ["maan_1"])
  assert.deepEqual(mentionedHandles("mail a@maan.com"), [])
  assert.deepEqual(mentionedHandles("see https://rhenko.app/@maan_1"), [])
  assert.deepEqual(mentionedHandles("no one named here"), [])
})
