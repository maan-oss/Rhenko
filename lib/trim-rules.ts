// The rules for trimming a video before it is posted, written so the browser and the server run the same checks. The
// trim sheet uses the handle moves and the labels; the server uses parseTrimFields and trimProblem, because a trim
// arrives from the browser and is never taken on trust. Nothing here imports anything, so a unit test can run it.

export type Trim = { start: number; end: number }

// The shortest part that can be kept, in seconds.
export const MIN_TRIM_SECONDS = 1
// How far past the end the browser's reading of a video's length may be from the server's. The two read the same file but can
// disagree by a frame or two, and a person who drags the end handle all the way right sends the browser's number.
export const TRIM_SLACK_SECONDS = 0.5
// Handles move in tenths of a second.
const STEP = 0.1
// Decimal arithmetic on tenths drifts in the last digits (3.1 + 1 is 4.1000000000000005). Comparisons allow for it.
const EPSILON = 1e-6

function floorTenth(seconds: number): number {
  return Math.floor(seconds / STEP + EPSILON) / 10
}

function ceilTenth(seconds: number): number {
  return Math.ceil(seconds / STEP - EPSILON) / 10
}

function roundTenth(seconds: number): number {
  return Math.round(seconds / STEP) / 10
}

// ── Server checks ───────────────────────────────────────────────────────────────────────────────────────────────────

// Why a trim can't be used, in words the person can act on, or null when it can. `duration` is the length ffprobe read from
// the file; leave it null to check the numbers alone (before the file has been opened).
export function trimProblem(trim: { start: unknown; end: unknown }, maxSeconds: number, duration: number | null): string | null {
  const { start, end } = trim
  if (typeof start !== "number" || typeof end !== "number" || !Number.isFinite(start) || !Number.isFinite(end)) {
    return "Pick a start and an end for the video."
  }
  if (start < 0) return "The trim can't start before the video does."
  if (start >= end) return "The trim has to start before it ends."
  if (end - start < MIN_TRIM_SECONDS - EPSILON) return `Keep at least ${MIN_TRIM_SECONDS} second of the video.`
  if (end - start > maxSeconds + EPSILON) return `A video can be up to ${maxSeconds} seconds long. Pick a shorter part.`
  if (duration !== null) {
    if (start >= duration) return "The trim starts after the video ends."
    if (end > duration + TRIM_SLACK_SECONDS) return "The trim ends after the video does."
    if (Math.min(end, duration) - start < MIN_TRIM_SECONDS - EPSILON) return `Keep at least ${MIN_TRIM_SECONDS} second of the video.`
  }
  return null
}

// Reads the two form fields a trim travels in. Both empty means no trim. A number is plain digits with an optional decimal part,
// so "NaN", "1e3", "Infinity" and a minus sign are all turned away.
export type TrimFields = { ok: true; trim: Trim | null } | { ok: false; error: string }

const SECONDS_FIELD = /^\d{1,6}(\.\d{1,6})?$/

export function parseTrimFields(start: unknown, end: unknown, maxSeconds: number): TrimFields {
  const blank = (value: unknown) => value === undefined || value === null || value === ""
  if (blank(start) && blank(end)) return { ok: true, trim: null }
  if (typeof start !== "string" || typeof end !== "string" || !SECONDS_FIELD.test(start) || !SECONDS_FIELD.test(end)) {
    return { ok: false, error: "Pick a start and an end for the video." }
  }
  const trim = { start: Number(start), end: Number(end) }
  const problem = trimProblem(trim, maxSeconds, null)
  return problem ? { ok: false, error: problem } : { ok: true, trim }
}

// The text a trim travels as. Milliseconds are plenty, and they keep the number free of floating point tails.
export function trimField(seconds: number): string {
  return String(Math.round(seconds * 1000) / 1000)
}

// ── Handles ─────────────────────────────────────────────────────────────────────────────────────────────────────────

// The window a video starts with: its first `maxSeconds` seconds, or all of it when it is shorter.
export function firstWindow(duration: number, maxSeconds: number): Trim {
  return { start: 0, end: Math.min(duration, maxSeconds) }
}

// The start handle moved to `want`. It stays at or after 0, at least a second before the end handle, and no further back than
// the longest allowed window. Handles never cross.
export function moveStart(window: Trim, want: number, maxSeconds: number): Trim {
  const earliest = Math.max(0, ceilTenth(window.end - maxSeconds))
  const latest = Math.max(earliest, floorTenth(window.end - MIN_TRIM_SECONDS))
  return { start: Math.min(latest, Math.max(earliest, roundTenth(want))), end: window.end }
}

// The end handle moved to `want`. It stays at least a second after the start handle and inside the video, and no further on
// than the longest allowed window. Near the end of the video it snaps to the exact end, so "all the way right" means all of it.
export function moveEnd(window: Trim, want: number, duration: number, maxSeconds: number): Trim {
  const earliest = Math.min(duration, ceilTenth(window.start + MIN_TRIM_SECONDS))
  const furthest = Math.min(duration, window.start + maxSeconds)
  const latest = furthest >= duration ? duration : floorTenth(furthest)
  const wanted = want >= duration - STEP / 2 ? duration : roundTenth(want)
  return { start: window.start, end: Math.min(latest, Math.max(earliest, wanted)) }
}

// True when the window is the whole video, so there is nothing to cut.
export function coversWhole(window: Trim, duration: number): boolean {
  return window.start <= EPSILON && window.end >= duration - EPSILON
}

// ── Labels ──────────────────────────────────────────────────────────────────────────────────────────────────────────

// 4 becomes "0:04", 65 "1:05" and 3723 "1:02:03". A time between whole seconds keeps one decimal ("0:04.5"), so the label
// says exactly where the cut is.
export function formatClock(seconds: number): string {
  const safe = Math.max(0, roundTenth(seconds))
  const whole = Math.floor(safe)
  const tenth = Math.round((safe - whole) * 10)
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor((whole % 3600) / 60)
  const secs = String(whole % 60).padStart(2, "0")
  const fraction = tenth > 0 ? `.${tenth}` : ""
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${secs}${fraction}` : `${minutes}:${secs}${fraction}`
}

// "0:04 to 0:31"
export function rangeLabel(window: Trim): string {
  return `${formatClock(window.start)} to ${formatClock(window.end)}`
}

// A length for people who read it aloud: "27 seconds", "1 minute 5 seconds".
export function spokenLength(seconds: number): string {
  const whole = Math.round(seconds)
  const minutes = Math.floor(whole / 60)
  const secs = whole % 60
  const part = (count: number, unit: string) => `${count} ${unit}${count === 1 ? "" : "s"}`
  if (minutes === 0) return part(secs, "second")
  return secs === 0 ? part(minutes, "minute") : `${part(minutes, "minute")} ${part(secs, "second")}`
}
