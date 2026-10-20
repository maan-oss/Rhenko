// Unit checks for the remembered home tab in lib/feed-tab.ts: only the two home tabs are read back from the cookie, and
// anything else (a pinned list id, an empty value, a tampered value) falls back to the default.
// Run with: npm run test:unit

import { test } from "node:test"
import assert from "node:assert/strict"
import { FEED_TAB_COOKIE, parseHomeTab } from "../lib/feed-tab.ts"

test("the cookie name is the one the Privacy Policy lists", () => {
  assert.equal(FEED_TAB_COOKIE, "rhenko-feed")
})

test("the two home tabs are read back", () => {
  assert.equal(parseHomeTab("for-you"), "for-you")
  assert.equal(parseHomeTab("following"), "following")
})

test("anything else falls back to the default", () => {
  assert.equal(parseHomeTab(undefined), null)
  assert.equal(parseHomeTab(null), null)
  assert.equal(parseHomeTab(""), null)
  assert.equal(parseHomeTab("FOLLOWING"), null)
  assert.equal(parseHomeTab("some-pinned-list-id"), null)
  assert.equal(parseHomeTab("following; path=/"), null)
})
