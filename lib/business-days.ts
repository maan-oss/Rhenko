// Business days, for the legal deadlines the app keeps: a counter-notice's 10 to 14 business days (17 U.S.C. 512(g)(2)(C)). A business
// day is a weekday that is not a U.S. federal holiday. Times are milliseconds; days are read in UTC. Pure, so the server, the command
// line and the tests share one count.

const DAY = 24 * 60 * 60 * 1000

function iso(time: number): string {
  return new Date(time).toISOString().slice(0, 10)
}

// The nth weekday of a month (0 = Sunday, 1 = Monday, ...), counting from 1.
function nthWeekday(year: number, month: number, weekday: number, n: number): number {
  const first = new Date(Date.UTC(year, month, 1)).getUTCDay()
  return Date.UTC(year, month, 1 + ((weekday - first + 7) % 7) + (n - 1) * 7)
}

// The last weekday of a month.
function lastWeekday(year: number, month: number, weekday: number): number {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const last = new Date(Date.UTC(year, month, lastDay)).getUTCDay()
  return Date.UTC(year, month, lastDay - ((last - weekday + 7) % 7))
}

// A fixed-date holiday as federal employees keep it: a Saturday is kept on the Friday before, a Sunday on the Monday after. New
// Year's Day that falls on a Saturday is not kept on the Friday before (the Office of Personnel Management's rule).
function observed(year: number, month: number, day: number, newYear = false): number {
  const date = new Date(Date.UTC(year, month, day))
  const weekday = date.getUTCDay()
  if (weekday === 6 && !newYear) return Date.UTC(year, month, day - 1)
  if (weekday === 0) return Date.UTC(year, month, day + 1)
  return date.getTime()
}

const holidayCache = new Map<number, Set<string>>()

// The days a year's U.S. federal holidays are kept, as YYYY-MM-DD.
export function federalHolidays(year: number): Set<string> {
  const cached = holidayCache.get(year)
  if (cached) return cached
  const days = new Set(
    [
      observed(year, 0, 1, true), // New Year's Day
      nthWeekday(year, 0, 1, 3), // Martin Luther King Jr. Day: third Monday of January
      nthWeekday(year, 1, 1, 3), // Washington's Birthday: third Monday of February
      lastWeekday(year, 4, 1), // Memorial Day: last Monday of May
      observed(year, 5, 19), // Juneteenth
      observed(year, 6, 4), // Independence Day
      nthWeekday(year, 8, 1, 1), // Labor Day: first Monday of September
      nthWeekday(year, 9, 1, 2), // Columbus Day: second Monday of October
      observed(year, 10, 11), // Veterans Day
      nthWeekday(year, 10, 4, 4), // Thanksgiving: fourth Thursday of November
      observed(year, 11, 25), // Christmas Day
    ].map(iso)
  )
  holidayCache.set(year, days)
  return days
}

// Whether a day is a business day: a weekday that is not a federal holiday.
export function isBusinessDay(time: number): boolean {
  const date = new Date(time)
  const weekday = date.getUTCDay()
  if (weekday === 0 || weekday === 6) return false
  return !federalHolidays(date.getUTCFullYear()).has(iso(time))
}

// The time that is the given number of business days after a time. The time of day is kept.
export function addBusinessDays(from: number, days: number): number {
  let cursor = from
  let left = days
  while (left > 0) {
    cursor += DAY
    if (isBusinessDay(cursor)) left--
  }
  return cursor
}
