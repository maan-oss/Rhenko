// Unit checks for the order of Home tabs (lib/home-tab-order.ts). Run with: npm run test:unit
//
// A viewer's Home tabs are lists and topics in one order. Moving a tab swaps it with the next tab the viewer can see; a tab
// that is hidden for now (its owner blocked the viewer, or its topic is snoozed) keeps its slot.

import { test } from "node:test"
import assert from "node:assert/strict"
import { movedOrder, reslot, tabKey } from "../lib/home-tab-order.ts"

const list = (id) => ({ kind: "list", id })
const topic = (tag) => ({ kind: "topic", tag })

test("a list and a topic with the same name are different tabs", () => {
  assert.notEqual(tabKey(list("music")), tabKey(topic("music")))
  assert.equal(tabKey(topic("$AAPL")), "topic:$AAPL")
})

test("a tab moves one place up or down", () => {
  const order = [list("a"), topic("b"), list("c")]
  assert.deepEqual(movedOrder(order, topic("b"), -1), [topic("b"), list("a"), list("c")])
  assert.deepEqual(movedOrder(order, topic("b"), 1), [list("a"), list("c"), topic("b")])
})

test("a tab already at the end, or not pinned, does not move", () => {
  const order = [list("a"), topic("b")]
  assert.equal(movedOrder(order, list("a"), -1), null)
  assert.equal(movedOrder(order, topic("b"), 1), null)
  assert.equal(movedOrder(order, list("missing"), 1), null)
})

test("moving does not change the order it was given", () => {
  const order = [list("a"), list("b")]
  movedOrder(order, list("a"), 1)
  assert.deepEqual(order, [list("a"), list("b")])
})

test("a hidden tab keeps its slot when the tabs around it move", () => {
  // Order: a, hidden, b. Only a and b show, so moving b up puts it in front of a and leaves the hidden tab where it was.
  const all = [list("a"), topic("hidden"), list("b")]
  const shownNow = [list("a"), list("b")]
  const shownOrder = movedOrder(shownNow, list("b"), -1)
  assert.deepEqual(reslot(all, shownNow, shownOrder), [list("b"), topic("hidden"), list("a")])
})

test("with every tab shown, reslot is the new order", () => {
  const all = [list("a"), topic("b"), list("c")]
  const shownNow = all
  const shownOrder = movedOrder(shownNow, list("c"), -1)
  assert.deepEqual(reslot(all, shownNow, shownOrder), [list("a"), list("c"), topic("b")])
})
