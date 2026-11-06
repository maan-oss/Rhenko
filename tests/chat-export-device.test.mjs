// Unit checks for an encrypted chat's export and search made on the device (lib/chat-export.ts exportedMessage and searchableOf, and
// lib/chat-message-rules.ts searchHitsOf). The server never holds an encrypted message's text, so these are the only place its words
// are written out. Run with: npm run test:unit

import { test } from "node:test"
import assert from "node:assert/strict"
import { UNREADABLE_IN_EXPORT, chatExportText, exportedMessage, searchableOf } from "../lib/chat-export.ts"
import { searchHitsOf } from "../lib/chat-message-rules.ts"

// A message row as the export gets it from the server, before any device has opened it.
function row(overrides = {}) {
  return {
    id: "m1",
    mine: false,
    createdAt: Date.UTC(2026, 10, 6, 9, 0, 0),
    senderName: "Asha",
    body: "",
    editedAt: null,
    deleted: false,
    viewOnce: false,
    hasMedia: false,
    attachment: null,
    callOutcome: null,
    timerChange: null,
    sealed: null,
    ...overrides,
  }
}

const sealedRef = { envelope: "{}", wrap: null, file: null }

test("a plain message is exported as the server gives it", () => {
  const plain = row({ body: "Lunch at one?", editedAt: Date.UTC(2026, 10, 6, 9, 5) })
  const line = exportedMessage(plain, undefined)
  assert.equal(line.body, "Lunch at one?")
  assert.equal(line.editedAt, plain.editedAt)
  assert.equal(line.id, undefined, "the export line carries the export's own fields only")
  assert.equal(line.sealed, undefined)
})

test("an encrypted message this device has not opened reads as a note, never as blank", () => {
  const line = exportedMessage(row({ sealed: sealedRef, hasMedia: true, attachment: { kind: "poll", question: "Encrypted poll", options: [] } }), undefined)
  assert.equal(line.body, UNREADABLE_IN_EXPORT)
  assert.equal(line.attachment, null)
  assert.equal(line.hasMedia, false)
  const failed = exportedMessage(row({ sealed: sealedRef }), { ok: false, error: "No key for this device." })
  assert.equal(failed.body, UNREADABLE_IN_EXPORT)
})

test("an opened encrypted text keeps its words and the edited mark", () => {
  const edited = Date.UTC(2026, 10, 6, 9, 5)
  const line = exportedMessage(row({ sealed: sealedRef, editedAt: edited }), { ok: true, text: "See you at one.", attachment: null })
  assert.equal(line.body, "See you at one.")
  assert.equal(line.editedAt, edited)
  assert.equal(chatExportText("Asha", [line], false, Date.UTC(2026, 10, 6)).includes("See you at one. (edited)"), true)
})

test("an opened photo or voice note is listed by its presence, a document by its name", () => {
  const photo = exportedMessage(row({ sealed: sealedRef }), {
    ok: true,
    text: "Beach",
    attachment: { kind: "media", media: { file: "f", media: "image", mime: "image/png", name: "p.png", size: 1, key: "k", iv: "i", scan: false, viewOnce: true } },
  })
  assert.equal(photo.hasMedia, true)
  assert.equal(photo.viewOnce, true)
  assert.equal(photo.attachment, null)
  const doc = exportedMessage(row({ sealed: sealedRef }), {
    ok: true,
    text: "",
    attachment: { kind: "media", media: { file: "f", media: "document", mime: "application/pdf", name: "plan.pdf", size: 1, key: "k", iv: "i", scan: false, viewOnce: false } },
  })
  assert.deepEqual(doc.attachment, { kind: "document", name: "plan.pdf" })
  const text = chatExportText("Asha", [doc], false, Date.UTC(2026, 10, 6))
  assert.ok(text.includes("<file: plan.pdf>"))
})

test("an opened place, contact and poll show what they carry, not the server's placeholders", () => {
  const place = exportedMessage(row({ sealed: sealedRef }), { ok: true, text: "", attachment: { kind: "location", lat: 12.5, lng: 77.1 } })
  assert.deepEqual(place.attachment, { kind: "location", lat: 12.5, lng: 77.1 })
  const contact = exportedMessage(row({ sealed: sealedRef }), { ok: true, text: "", attachment: { kind: "contact", user: null } })
  assert.deepEqual(contact.attachment, { kind: "contact", name: null })
  const poll = exportedMessage(
    row({ sealed: sealedRef, attachment: { kind: "poll", question: "Encrypted poll", options: [{ label: "Choice 1" }] } }),
    {
      ok: true,
      text: "",
      attachment: {
        kind: "poll",
        question: "Lunch?",
        options: [
          { id: "a", label: "Pizza" },
          { id: "b", label: "Soup" },
        ],
        multiple: false,
      },
    }
  )
  assert.deepEqual(poll.attachment, { kind: "poll", question: "Lunch?", options: ["Pizza", "Soup"] })
})

test("searchableOf takes an encrypted message's words only once the device has them", () => {
  assert.equal(searchableOf(row({ sealed: sealedRef }), undefined), null)
  assert.equal(searchableOf(row({ sealed: sealedRef }), { ok: false, error: "x" }), null)
  const found = searchableOf(row({ sealed: sealedRef, mine: true }), { ok: true, text: "Bring the plan", attachment: null })
  assert.deepEqual(found, { id: "m1", senderName: "Asha", mine: true, createdAt: row().createdAt, text: "Bring the plan" })
  assert.equal(searchableOf(row({ body: "plain words" }), undefined).text, "plain words")
  assert.equal(searchableOf(row({ deleted: true, body: "" }), undefined), null)
})

test("searchHitsOf finds the words without regard to case, newest first, and marks the match", () => {
  const messages = [
    { id: "a", senderName: "Asha", mine: false, createdAt: 100, text: "Meet at the Station tomorrow" },
    { id: "b", senderName: "Ravi", mine: true, createdAt: 300, text: "Station is closed" },
    { id: "c", senderName: "Asha", mine: false, createdAt: 200, text: "No match here" },
  ]
  const hits = searchHitsOf(messages, "station", 50)
  assert.deepEqual(
    hits.map((hit) => hit.id),
    ["b", "a"]
  )
  assert.equal(hits[0].match, "Station")
  assert.equal(hits[0].mine, true)
  assert.deepEqual(searchHitsOf(messages, "", 50), [])
  assert.equal(searchHitsOf(messages, "station", 1).length, 1)
})
