// Unit checks for linking a browser to an account (lib/e2ee-link-rules.ts): the six-digit code a new browser shows, the copied message
// keys an approving device sends, and where a copy goes on from. The server and the browser both use these rules. Run with:
// npm run test:unit

import { test } from "node:test"
import assert from "node:assert/strict"
import {
  HISTORY_BATCH_MAX,
  LINK_COPY_MS,
  LINK_WAIT_MS,
  formatLinkCode,
  historyCursorInput,
  historyWrapsInput,
  linkCodeInput,
} from "../lib/e2ee-link-rules.ts"

const WRAP = { messageId: "0b1c2d3e-4f50-4617-8829-3a4b5c6d7e8f", epk: "AAAA", iv: "BBBB", key: "CCCC+/==" }

test("a link code is six digits, with spaces or dashes allowed between them", () => {
  assert.deepEqual(linkCodeInput("123456"), { ok: true, code: "123456" })
  assert.deepEqual(linkCodeInput("123 456"), { ok: true, code: "123456" })
  assert.deepEqual(linkCodeInput("123-456"), { ok: true, code: "123456" })
  for (const bad of ["12345", "1234567", "12a456", "", "    ", 123456, null]) {
    assert.equal(linkCodeInput(bad).ok, false, `${JSON.stringify(bad)} is not a code`)
  }
})

test("a link code is shown in two groups of three", () => {
  assert.equal(formatLinkCode("123456"), "123 456")
  assert.equal(formatLinkCode("000042"), "000 042")
  assert.equal(formatLinkCode("12"), "12", "a short code is shown as it is")
})

test("copied keys are checked before they are stored", () => {
  const ok = historyWrapsInput([WRAP])
  assert.equal(ok.ok, true)
  assert.deepEqual(ok.wraps, [WRAP])
  assert.equal(historyWrapsInput([]).ok, false, "an empty batch is refused")
  assert.equal(historyWrapsInput(Array.from({ length: HISTORY_BATCH_MAX + 1 }, () => WRAP)).ok, false, "a batch over the limit is refused")
  assert.equal(historyWrapsInput(Array.from({ length: HISTORY_BATCH_MAX }, () => WRAP)).ok, true, "a batch at the limit is fine")
  assert.equal(historyWrapsInput("not a list").ok, false)
  assert.equal(historyWrapsInput([{ ...WRAP, messageId: "" }]).ok, false)
  assert.equal(historyWrapsInput([{ ...WRAP, key: "not base64!" }]).ok, false, "a part that isn't base64 is refused")
  assert.equal(historyWrapsInput([{ ...WRAP, epk: "A".repeat(513) }]).ok, false, "an oversized part is refused")
  assert.equal(historyWrapsInput([{ messageId: WRAP.messageId, epk: WRAP.epk, iv: WRAP.iv }]).ok, false, "a missing part is refused")
})

test("a copy goes on from the message it last reached, and starts from the beginning without one", () => {
  assert.deepEqual(historyCursorInput(undefined), { ok: true, after: "" })
  assert.deepEqual(historyCursorInput(""), { ok: true, after: "" })
  assert.deepEqual(historyCursorInput("m-42"), { ok: true, after: "m-42" })
  assert.equal(historyCursorInput(42).ok, false)
  assert.equal(historyCursorInput("x".repeat(65)).ok, false)
})

test("a waiting link runs out before an approved one does, so a copy has time to finish", () => {
  assert.ok(LINK_WAIT_MS > 0)
  assert.ok(LINK_COPY_MS > LINK_WAIT_MS)
})
