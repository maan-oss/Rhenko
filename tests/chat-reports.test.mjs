// Unit checks for chat reports (lib/chat-reports.ts): a report opens with the key it was sealed to, and only for the chat, message and
// key it names; a changed or moved report is refused; the server accepts only a sealed report with the right shape and size; and the
// key the server uses is a public key. Run with: npm run test:unit

import { test } from "node:test"
import assert from "node:assert/strict"
import {
  CHAT_REPORT_MAX_SEALED,
  CHAT_REPORT_MESSAGES,
  CHAT_REPORT_RETENTION_MS,
  CHAT_REPORT_VERSION,
  ReportError,
  isPublicP256Jwk,
  openReport,
  parseSealedReport,
  reportContext,
  reportKeyId,
  sealReport,
} from "../lib/chat-reports.ts"

const CONVERSATION = "conv-1"
const MESSAGE = "11111111-2222-4333-8444-555555555555"
const OTHER_MESSAGE = "66666666-7777-4888-8999-aaaaaaaaaaaa"

async function keyPair() {
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])
  const priv = await crypto.subtle.exportKey("jwk", pair.privateKey)
  const pub = await crypto.subtle.exportKey("jwk", pair.publicKey)
  const jwk = { kty: "EC", crv: "P-256", x: pub.x, y: pub.y }
  return { privateJwk: priv, jwk, kid: await reportKeyId(jwk) }
}

function payloadFor(messageId = MESSAGE) {
  return {
    v: CHAT_REPORT_VERSION,
    reason: "Spam",
    reportedMessageId: messageId,
    conversation: { id: CONVERSATION, encrypted: true },
    messages: [
      {
        id: messageId,
        sender: { id: "u-2", handle: "sam" },
        sentAt: 1_700_000_000_000,
        text: "buy now",
        deleted: false,
        media: null,
        attachment: null,
      },
    ],
    createdAt: 1_700_000_000_500,
  }
}

test("a sealed report opens with the private key for the chat and message it names", async () => {
  const key = await keyPair()
  const context = reportContext(CONVERSATION, MESSAGE, key.kid)
  const sealed = await sealReport({ kid: key.kid, jwk: key.jwk }, context, payloadFor())
  const opened = await openReport(key.privateJwk, context, sealed)
  assert.equal(opened.reason, "Spam")
  assert.equal(opened.reportedMessageId, MESSAGE)
  assert.equal(opened.messages[0].text, "buy now")
  assert.equal(opened.messages[0].sender.handle, "sam")
})

test("a sealed report does not open for another message, chat or key", async () => {
  const key = await keyPair()
  const context = reportContext(CONVERSATION, MESSAGE, key.kid)
  const sealed = await sealReport({ kid: key.kid, jwk: key.jwk }, context, payloadFor())
  await assert.rejects(openReport(key.privateJwk, reportContext(CONVERSATION, OTHER_MESSAGE, key.kid), sealed), ReportError)
  await assert.rejects(openReport(key.privateJwk, reportContext("conv-2", MESSAGE, key.kid), sealed), ReportError)
  const other = await keyPair()
  await assert.rejects(openReport(other.privateJwk, context, sealed), ReportError)
})

test("a report changed in transit is refused", async () => {
  const key = await keyPair()
  const context = reportContext(CONVERSATION, MESSAGE, key.kid)
  const sealed = await sealReport({ kid: key.kid, jwk: key.jwk }, context, payloadFor())
  const bytes = Buffer.from(sealed.ct, "base64")
  bytes[0] ^= 0x01
  await assert.rejects(openReport(key.privateJwk, context, { ...sealed, ct: bytes.toString("base64") }), ReportError)
})

test("each sealing uses a new key and nonce, so two reports of one message differ", async () => {
  const key = await keyPair()
  const context = reportContext(CONVERSATION, MESSAGE, key.kid)
  const first = await sealReport({ kid: key.kid, jwk: key.jwk }, context, payloadFor())
  const second = await sealReport({ kid: key.kid, jwk: key.jwk }, context, payloadFor())
  assert.notEqual(first.epk, second.epk)
  assert.notEqual(first.iv, second.iv)
  assert.notEqual(first.ct, second.ct)
})

test("a public key is a P-256 key with no private part", async () => {
  const key = await keyPair()
  assert.equal(isPublicP256Jwk(key.jwk), true)
  assert.equal(isPublicP256Jwk({ ...key.jwk, d: key.privateJwk.d }), false)
  assert.equal(isPublicP256Jwk({ kty: "RSA", n: "x", e: "AQAB" }), false)
  assert.equal(isPublicP256Jwk({ kty: "EC", crv: "P-384", x: "x", y: "y" }), false)
  assert.equal(isPublicP256Jwk(null), false)
  assert.equal(isPublicP256Jwk("key"), false)
})

test("the key id is stable for a key and differs between keys", async () => {
  const key = await keyPair()
  const other = await keyPair()
  assert.equal(await reportKeyId(key.jwk), key.kid)
  assert.match(key.kid, /^[0-9a-f]{16}$/)
  assert.notEqual(key.kid, other.kid)
  await assert.rejects(reportKeyId({ kty: "EC", crv: "P-256", x: "x", y: "y", d: "secret" }), ReportError)
})

test("the server accepts only a sealed report of the right shape and size", () => {
  const good = { v: CHAT_REPORT_VERSION, kid: "abc", epk: "AAAA", iv: "AAAA", ct: "AAAA" }
  assert.deepEqual(parseSealedReport(good), good)
  assert.equal(parseSealedReport({ ...good, v: 2 }), null)
  assert.equal(parseSealedReport({ ...good, ct: undefined }), null)
  assert.equal(parseSealedReport({ ...good, kid: 7 }), null)
  assert.equal(parseSealedReport({ ...good, ct: "A".repeat(CHAT_REPORT_MAX_SEALED + 1) }), null)
  assert.equal(parseSealedReport({ ...good, epk: "A".repeat(257) }), null)
  assert.equal(parseSealedReport(null), null)
  assert.equal(parseSealedReport("report"), null)
})

test("reports keep five messages and one year, as the policy states", () => {
  assert.equal(CHAT_REPORT_MESSAGES, 5)
  assert.equal(CHAT_REPORT_RETENTION_MS, 365 * 24 * 60 * 60 * 1000)
})
