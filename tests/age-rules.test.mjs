// Unit checks for the age gate, in lib/age-rules.ts. Run with: npm run test:unit

import { test } from "node:test"
import assert from "node:assert/strict"
import { ageGateMessage, isAtLeast } from "../lib/age-rules.ts"

const day = (year, month, date) => new Date(Date.UTC(year, month - 1, date, 12))

test("the birthday itself is the day someone turns the age", () => {
  const dob = { year: 2008, month: 11, day: 7 }
  assert.equal(isAtLeast(dob, 18, day(2026, 11, 6)), false)
  assert.equal(isAtLeast(dob, 18, day(2026, 11, 7)), true)
})

test("a 31 December birthday counts the next 31 December, not before", () => {
  const dob = { year: 2008, month: 12, day: 31 }
  assert.equal(isAtLeast(dob, 18, day(2026, 12, 30)), false)
  assert.equal(isAtLeast(dob, 18, day(2026, 12, 31)), true)
})

test("a 29 February birthday turns the age on 1 March in a year with no 29 February", () => {
  const dob = { year: 2008, month: 2, day: 29 }
  assert.equal(isAtLeast(dob, 18, day(2026, 2, 28)), false)
  assert.equal(isAtLeast(dob, 18, day(2026, 3, 1)), true)
})

test("only a confirmed adult passes the gate; the other states get a line that says why", () => {
  assert.equal(ageGateMessage("adult"), null)
  for (const check of ["none", "pending", "not_adult"]) {
    assert.equal(typeof ageGateMessage(check), "string", check)
  }
  assert.match(ageGateMessage("not_adult"), /18 and over/)
})
