// Unit checks for the account marks, in lib/badges.ts. Run with: npm run test:unit

import { test } from "node:test"
import assert from "node:assert/strict"
import { accountMarks, OG_LIMIT, VETERAN_DAYS } from "../lib/badges.ts"

const DAY = 24 * 60 * 60 * 1000
const now = Date.UTC(2027, 0, 1)
const row = (over = {}) => ({ mark_og: 0, mark_created_at: now, mark_id_checked: 0, ...over })

test("the limits are the operator's decisions: the first 1000 accounts, and a year", () => {
  assert.equal(OG_LIMIT, 1000)
  assert.equal(VETERAN_DAYS, 365)
})

test("an account a year old is a Veteran, and one a day younger is not", () => {
  assert.equal(accountMarks(row({ mark_created_at: now - VETERAN_DAYS * DAY }), now).veteran, true)
  assert.equal(accountMarks(row({ mark_created_at: now - (VETERAN_DAYS - 1) * DAY }), now).veteran, false)
})

test("OG follows the stored flag only", () => {
  assert.equal(accountMarks(row({ mark_og: 1 }), now).og, true)
  assert.equal(accountMarks(row({ mark_og: 0 }), now).og, false)
})

test("the ID mark needs the flag the query already limits to adults", () => {
  assert.equal(accountMarks(row({ mark_id_checked: 1 }), now).idChecked, true)
  assert.equal(accountMarks(row({ mark_id_checked: 0 }), now).idChecked, false)
})
