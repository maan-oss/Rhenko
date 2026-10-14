// Unit checks for how long a post or a reply can be edited, in lib/rules.ts. Run with: npm run test:unit

import { test } from "node:test"
import assert from "node:assert/strict"
import { editWindowMs, EDIT_WINDOW_MS, PLUS_EDIT_WINDOW_MS, REPLY_EDIT_WINDOW_MS } from "../lib/rules.ts"

test("a post keeps the 60 minute window, and Plus gets 24 hours", () => {
  assert.equal(editWindowMs(false), EDIT_WINDOW_MS)
  assert.equal(editWindowMs(true), PLUS_EDIT_WINDOW_MS)
})

test("a reply can be edited for 5 minutes, even on a Plus account", () => {
  assert.equal(REPLY_EDIT_WINDOW_MS, 5 * 60 * 1000)
  assert.equal(editWindowMs(false, true), REPLY_EDIT_WINDOW_MS)
  assert.equal(editWindowMs(true, true), REPLY_EDIT_WINDOW_MS)
})
