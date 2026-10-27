// Disappearing messages. Anyone in a conversation can set its timer, and a message sent while the timer is on is gone for
// everyone once that long has passed since it was sent. A change applies to the messages sent after it: earlier messages
// keep the timer they were sent with, or none. Pure functions only, so client components and the unit tests can use them.

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

// The choices, in the order the picker lists them. `short` is the badge on the header button.
export const MESSAGE_TIMERS = [
  { ms: 0, label: "Off", short: "" },
  { ms: DAY, label: "24 hours", short: "24h" },
  { ms: 7 * DAY, label: "7 days", short: "7d" },
  { ms: 30 * DAY, label: "30 days", short: "30d" },
] as const

export type MessageTimer = (typeof MESSAGE_TIMERS)[number]["ms"]

// One of the choices, or null for anything else. Server actions can be called with anything.
export function asMessageTimer(value: unknown): MessageTimer | null {
  const match = MESSAGE_TIMERS.find((timer) => timer.ms === value)
  return match ? match.ms : null
}

// "24 hours", "7 days", or "Off". A stored value that is not one of the choices still reads as a length of time.
export function timerLabel(ms: number): string {
  const match = MESSAGE_TIMERS.find((timer) => timer.ms === ms)
  if (match) return match.label
  if (ms <= 0) return "Off"
  if (ms % DAY === 0) return `${ms / DAY} ${ms === DAY ? "day" : "days"}`
  const hours = Math.max(1, Math.round(ms / HOUR))
  return `${hours} ${hours === 1 ? "hour" : "hours"}`
}

// The badge on the header button: "24h", "7d", "30d". Empty when the timer is off.
export function timerShort(ms: number): string {
  const match = MESSAGE_TIMERS.find((timer) => timer.ms === ms)
  if (match) return match.short
  if (ms <= 0) return ""
  return ms % DAY === 0 ? `${ms / DAY}d` : `${Math.max(1, Math.round(ms / HOUR))}h`
}

// The line the thread shows where the timer was changed, and the conversation list shows when it is the latest thing.
export function timerLine(ms: number): string {
  return ms > 0 ? `Disappearing messages turned on: ${timerLabel(ms)}` : "Disappearing messages turned off"
}

// What the conversation says under its header while the timer is on.
export function timerNotice(ms: number): string {
  return `New messages disappear after ${timerLabel(ms)}.`
}

// When a message sent at `sentAt` is gone, under the timer in force when it was sent. Null when it stays.
export function expiryFor(sentAt: number, timer: number): number | null {
  return timer > 0 ? sentAt + timer : null
}

export function isExpired(expiresAt: number | null | undefined, now: number): boolean {
  return typeof expiresAt === "number" && expiresAt <= now
}

// The soonest moment after `now` that one of these messages goes, or null when none of them is waiting to.
export function nextExpiry(expiries: (number | null | undefined)[], now: number): number | null {
  let soonest: number | null = null
  for (const at of expiries) {
    if (typeof at !== "number" || at <= now) continue
    if (soonest === null || at < soonest) soonest = at
  }
  return soonest
}
