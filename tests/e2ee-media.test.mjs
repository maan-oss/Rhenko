// Unit checks for sealed files in encrypted chats: a file opens for the message it was sealed for and nowhere else, a changed or moved
// file is refused, its key and nonce are not reused between files, and a payload is checked before it is shown. Run with: npm run test:unit

import { test } from "node:test"
import assert from "node:assert/strict"
import { SealedFileError, fromBase64, openFile, sealFile, toBase64 } from "../lib/e2ee-media.ts"
import { PAYLOAD_FILE_MAX_BYTES, PAYLOAD_TEXT_MAX, isSealableMime, parsePayload } from "../lib/e2ee-payload.ts"
import { MAX_DM, MAX_DOCUMENT_BYTES } from "../lib/rules.ts"

const CONVERSATION = "conv-1"
const MESSAGE = "11111111-2222-4333-8444-555555555555"
const OTHER_MESSAGE = "66666666-7777-4888-8999-aaaaaaaaaaaa"

function bytesOf(text) {
  return new TextEncoder().encode(text).buffer
}

function textOf(buffer) {
  return new TextDecoder().decode(buffer)
}

test("a sealed file opens with its key for the message it was sealed for", async () => {
  const sealed = await sealFile(bytesOf("a photo, pretend"), CONVERSATION, MESSAGE)
  const plain = await openFile(sealed.bytes.buffer, sealed.key, sealed.iv, CONVERSATION, MESSAGE)
  assert.equal(textOf(plain), "a photo, pretend")
})

test("the stored bytes are not the file: nothing of the plaintext is left in them", async () => {
  const sealed = await sealFile(bytesOf("PLAINTEXT-MARKER-XYZ"), CONVERSATION, MESSAGE)
  assert.equal(textOf(sealed.bytes.buffer).includes("PLAINTEXT-MARKER-XYZ"), false)
})

test("a file moved to another message, or another conversation, does not open", async () => {
  const sealed = await sealFile(bytesOf("secret"), CONVERSATION, MESSAGE)
  await assert.rejects(openFile(sealed.bytes.buffer, sealed.key, sealed.iv, CONVERSATION, OTHER_MESSAGE), SealedFileError)
  await assert.rejects(openFile(sealed.bytes.buffer, sealed.key, sealed.iv, "conv-2", MESSAGE), SealedFileError)
})

test("a changed file does not open", async () => {
  const sealed = await sealFile(bytesOf("secret"), CONVERSATION, MESSAGE)
  const changed = new Uint8Array(sealed.bytes)
  changed[0] ^= 0x01
  await assert.rejects(openFile(changed.buffer, sealed.key, sealed.iv, CONVERSATION, MESSAGE), SealedFileError)
})

test("each file gets its own key and nonce", async () => {
  const first = await sealFile(bytesOf("one"), CONVERSATION, MESSAGE)
  const second = await sealFile(bytesOf("one"), CONVERSATION, MESSAGE)
  assert.notEqual(first.key, second.key)
  assert.notEqual(first.iv, second.iv)
  assert.notDeepEqual(Array.from(first.bytes), Array.from(second.bytes))
})

test("a file key is 32 bytes and its nonce 12, and both survive base64", async () => {
  const sealed = await sealFile(bytesOf("x"), CONVERSATION, MESSAGE)
  assert.equal(fromBase64(sealed.key).length, 32)
  assert.equal(fromBase64(sealed.iv).length, 12)
  assert.equal(toBase64(fromBase64(sealed.key)), sealed.key)
})

function payload(overrides = {}) {
  const sealed = { key: "A".repeat(43) + "=", iv: "B".repeat(16) }
  return {
    kind: "media",
    body: "a caption",
    media: "image",
    mime: "image/jpeg",
    name: "holiday.jpg",
    size: 1024,
    key: sealed.key,
    iv: sealed.iv,
    scan: false,
    viewOnce: false,
    ...overrides,
  }
}

test("a file's payload is read as the file it describes", () => {
  const parsed = parsePayload(payload())
  assert.equal(parsed.kind, "media")
  assert.equal(parsed.media, "image")
  assert.equal(parsed.body, "a caption")
  assert.equal(parsed.key.length, 44)
})

test("a payload naming a type its kind may not carry is refused", () => {
  assert.equal(parsePayload(payload({ mime: "text/html" })), null)
  assert.equal(parsePayload(payload({ media: "video", mime: "video/mp4" })), null)
  assert.equal(parsePayload(payload({ mime: "image/svg+xml" })), null)
})

test("a payload with a bad key, nonce, size or name is refused", () => {
  assert.equal(parsePayload(payload({ key: "short" })), null)
  assert.equal(parsePayload(payload({ iv: "tooshort" })), null)
  assert.equal(parsePayload(payload({ size: -1 })), null)
  assert.equal(parsePayload(payload({ size: 1.5 })), null)
  assert.equal(parsePayload(payload({ name: "" })), null)
  assert.equal(parsePayload(payload({ scan: "yes" })), null)
})

test("a text payload is still a text payload, and an unknown kind is refused", () => {
  assert.deepEqual(parsePayload({ kind: "text", body: "hello" }), { kind: "text", body: "hello" })
  assert.equal(parsePayload({ kind: "poll", body: "" }), null)
  assert.equal(parsePayload({ kind: "text", body: "x".repeat(1001) }), null)
})

test("a voice note, an audio file, a document and a photo each accept their own types only", () => {
  assert.equal(isSealableMime("voice", "audio/webm"), true)
  assert.equal(isSealableMime("voice", "application/pdf"), false)
  assert.equal(isSealableMime("audio", "audio/mpeg"), true)
  assert.equal(isSealableMime("document", "application/pdf"), true)
  assert.equal(isSealableMime("document", "image/png"), false)
  assert.equal(isSealableMime("image", "image/png"), true)
  assert.equal(isSealableMime("image", "audio/webm"), false)
})

test("the payload limits are the same as the shared rules", () => {
  assert.equal(PAYLOAD_TEXT_MAX, MAX_DM)
  assert.equal(PAYLOAD_FILE_MAX_BYTES, MAX_DOCUMENT_BYTES)
})
