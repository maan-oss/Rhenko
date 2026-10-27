// Unit checks for disappearing messages (lib/message-timers.ts): the four choices, what the thread and the header say, and
// when a message is gone. Run with: npm run test:unit

import { test } from "node:test"
import assert from "node:assert/strict"
import {
  MESSAGE_TIMERS,
  asMessageTimer,
  expiryFor,
  isExpired,
  nextExpiry,
  timerLabel,
  timerLine,
  timerNotice,
  timerShort,
} from "../lib/message-timers.ts"

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

test("the choices are Off, 24 hours, 7 days and 30 days, in that order", () => {
  assert.deepEqual(MESSAGE_TIMERS.map((timer) => timer.ms), [0, DAY, 7 * DAY, 30 * DAY])
  assert.deepEqual(MESSAGE_TIMERS.map((timer) => timer.label), ["Off", "24 hours", "7 days", "30 days"])
})

test("only one of the choices is accepted", () => {
  assert.equal(asMessageTimer(0), 0)
  assert.equal(asMessageTimer(DAY), DAY)
  assert.equal(asMessageTimer(30 * DAY), 30 * DAY)
  for (const value of [1, -DAY, HOUR, 2 * DAY, 31 * DAY, "86400000", null, undefined, Number.NaN, Number.POSITIVE_INFINITY, {}]) {
    assert.equal(asMessageTimer(value), null, `${String(value)} was accepted`)
  }
})

test("the thread records turning it on and off in plain words", () => {
  assert.equal(timerLine(DAY), "Disappearing messages turned on: 24 hours")
  assert.equal(timerLine(7 * DAY), "Disappearing messages turned on: 7 days")
  assert.equal(timerLine(0), "Disappearing messages turned off")
  assert.equal(timerNotice(30 * DAY), "New messages disappear after 30 days.")
})

test("the badge is short, and empty when the timer is off", () => {
  assert.deepEqual(MESSAGE_TIMERS.map((timer) => timerShort(timer.ms)), ["", "24h", "7d", "30d"])
})

test("a stored value outside the choices still reads as a length of time", () => {
  assert.equal(timerLabel(2 * DAY), "2 days")
  assert.equal(timerLabel(HOUR), "1 hour")
  assert.equal(timerLabel(6 * HOUR), "6 hours")
  assert.equal(timerLabel(-5), "Off")
  assert.equal(timerShort(2 * DAY), "2d")
  assert.equal(timerShort(6 * HOUR), "6h")
})

test("a message expires at its sent time plus the timer it was sent with, and stays when the timer is off", () => {
  const sentAt = Date.UTC(2026, 9, 27, 9, 0, 0)
  assert.equal(expiryFor(sentAt, DAY), sentAt + DAY)
  assert.equal(expiryFor(sentAt, 0), null)
})

test("a message is gone from the moment it expires, not a moment later", () => {
  const at = 1_000_000
  assert.equal(isExpired(at, at - 1), false)
  assert.equal(isExpired(at, at), true)
  assert.equal(isExpired(at, at + 1), true)
  assert.equal(isExpired(null, Number.MAX_SAFE_INTEGER), false)
  assert.equal(isExpired(undefined, Number.MAX_SAFE_INTEGER), false)
})

test("the open thread wakes for the soonest message still to go", () => {
  assert.equal(nextExpiry([null, 500, 300, 900], 100), 300)
  assert.equal(nextExpiry([null, 500, 300, 900], 300), 500)
  assert.equal(nextExpiry([200, 100], 300), null)
  assert.equal(nextExpiry([], 0), null)
  assert.equal(nextExpiry([null, undefined], 0), null)
})
