// Business days for the counter-notice windows (lib/business-days.ts): weekdays that are not U.S. federal holidays, with the holidays
// that fall on a weekend kept on the nearest weekday, as federal employees keep them.
import { test } from "node:test"
import assert from "node:assert/strict"
import { addBusinessDays, federalHolidays, isBusinessDay } from "../lib/business-days.ts"

const at = (date) => Date.parse(`${date}T09:30:00Z`)
const day = (time) => new Date(time).toISOString().slice(0, 10)

test("the 2026 federal holidays are the days federal employees are off", () => {
  const days = federalHolidays(2026)
  for (const expected of [
    "2026-01-01",
    "2026-01-19",
    "2026-02-16",
    "2026-05-25",
    "2026-06-19",
    "2026-07-03",
    "2026-09-07",
    "2026-10-12",
    "2026-11-11",
    "2026-11-26",
    "2026-12-25",
  ]) {
    assert.ok(days.has(expected), `${expected} should be a holiday`)
  }
  assert.equal(days.size, 11)
})

test("a holiday on a Saturday is kept on the Friday before, and on a Sunday on the Monday after", () => {
  // 25 December 2027 is a Saturday, so the Friday before is kept; 4 July 2027 is a Sunday, so the Monday after is kept.
  assert.ok(federalHolidays(2027).has("2027-12-24"))
  assert.ok(!federalHolidays(2027).has("2027-12-25"))
  assert.ok(federalHolidays(2027).has("2027-07-05"))
})

test("New Year's Day on a Saturday is not kept on the Friday before", () => {
  // 1 January 2028 is a Saturday; 31 December 2027 stays a business day.
  assert.equal(isBusinessDay(at("2027-12-31")), true)
  assert.equal(isBusinessDay(at("2027-12-24")), false)
})

test("a business day is a weekday that is not a holiday", () => {
  assert.equal(isBusinessDay(at("2026-10-02")), true) // Friday
  assert.equal(isBusinessDay(at("2026-10-03")), false) // Saturday
  assert.equal(isBusinessDay(at("2026-10-12")), false) // Columbus Day
})

test("one business day after a Friday is the Monday", () => {
  assert.equal(day(addBusinessDays(at("2026-10-02"), 1)), "2026-10-05")
})

test("ten business days skip the weekend and the holiday in between", () => {
  // Friday 2 October: 5, 6, 7, 8, 9 October; 12 is Columbus Day; then 13, 14, 15, 16 and 19 October.
  assert.equal(day(addBusinessDays(at("2026-10-02"), 10)), "2026-10-19")
})

test("fourteen business days from the same Friday", () => {
  assert.equal(day(addBusinessDays(at("2026-10-02"), 14)), "2026-10-23")
})

test("Thanksgiving is skipped", () => {
  // Wednesday 25 November: Thursday 26 is Thanksgiving, so two business days later is Monday 30 November.
  assert.equal(day(addBusinessDays(at("2026-11-25"), 2)), "2026-11-30")
})

test("the time of day is kept", () => {
  const result = addBusinessDays(at("2026-10-02"), 10)
  assert.equal(new Date(result).toISOString().slice(11, 16), "09:30")
})
