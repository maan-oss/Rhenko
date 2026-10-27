// Unit checks for who hears about a chat message (lib/chat-audience.ts): the sender never does, and nobody blocked either way with
// the sender does. Run with: npm run test:unit

import { test } from "node:test"
import assert from "node:assert/strict"
import { audienceOf } from "../lib/chat-audience.ts"

test("everyone in the chat hears about a message except its sender", () => {
  assert.deepEqual(audienceOf(["ana", "ben", "cy"], "ana", new Set()), ["ben", "cy"])
})

test("someone blocked either way with the sender hears nothing", () => {
  // The set holds everyone blocked either way with the sender, whichever side made the block.
  assert.deepEqual(audienceOf(["ana", "ben", "cy", "dee"], "ana", new Set(["ben", "dee"])), ["cy"])
})

test("a blocked sender still reaches the people who are not blocked with them", () => {
  assert.deepEqual(audienceOf(["ana", "ben", "cy"], "ben", new Set(["ana"])), ["cy"])
})

test("when everyone else is blocked the message reaches no one but the sender's own tabs", () => {
  assert.deepEqual(audienceOf(["ana", "ben"], "ana", new Set(["ben"])), [])
})

test("the order of members is kept", () => {
  assert.deepEqual(audienceOf(["cy", "ben", "dee"], "dee", new Set(["ben"])), ["cy"])
})
