// Rules for the daily email digest: when one is due and what it says. Pure functions, constants and types only, so the
// settings page and tests/digest.test.mjs can use them on their own. The signed unsubscribe link is in lib/digest-token.ts,
// and the database work in lib/digest.ts.
import type { NotificationKind } from "@/lib/data"

const HOUR_MS = 60 * 60 * 1000
export const DAY_MS = 24 * HOUR_MS

// The digest lists this many of the newest things, however many came.
export const DIGEST_RECENT = 5
// The hour (UTC) a digest goes out when the person has not picked one.
export const DEFAULT_DIGEST_HOUR = 8
// Anything newer than this waits for the next digest, so a notification that is still being written is not missed by one
// digest and counted out of the next.
export const SETTLE_MS = 60 * 1000
// How many digests one maintenance pass sends, unless RHENKO_DIGEST_PER_PASS says otherwise.
export const DEFAULT_PER_PASS = 25
export const MAX_PER_PASS = 200
// A message's words are cut to this many characters when previews are on.
const PREVIEW_MAX = 140

// What the settings page and the server action say when the digest can't be turned on.
export const DIGEST_NEEDS_EMAIL = "Add and confirm an email address in Settings → Account first."
export const DIGEST_NOT_SET_UP = "The daily digest isn't set up on this server yet."

// What the digest counts. Notifications have a switch each in Settings → Notifications; messages have none.
export type DigestKind = NotificationKind | "message"

// The order the counts are listed in: the same as the switches in Settings, then messages.
export const DIGEST_KINDS: readonly DigestKind[] = ["like", "repost", "reply", "quote", "follow", "mention", "follow_request", "poll", "post", "message"]

const LABELS: Record<DigestKind, [one: string, many: string]> = {
  like: ["like", "likes"],
  repost: ["repost", "reposts"],
  reply: ["reply", "replies"],
  quote: ["quote", "quotes"],
  follow: ["new follower", "new followers"],
  mention: ["mention", "mentions"],
  follow_request: ["follow request", "follow requests"],
  poll: ["poll result", "poll results"],
  post: ["new post", "new posts"],
  message: ["message", "messages"],
}

// "1 like", "12 likes", "1 reply", "3 replies".
export function countLabel(kind: DigestKind, count: number): string {
  const [one, many] = LABELS[kind]
  return `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`
}

// The kinds a person has switched on, from their switches in Settings → Notifications. A kind with no switch counts as on.
export function enabledKinds(prefs: Partial<Record<string, boolean>>): DigestKind[] {
  return DIGEST_KINDS.filter((kind) => kind === "message" || prefs[kind] !== false)
}

// Days since 1970-01-01 (UTC) and the hour of that day, 0 to 23.
export function dayOf(ms: number): number {
  return Math.floor(ms / DAY_MS)
}

export function hourOf(ms: number): number {
  return Math.floor((ms % DAY_MS) / HOUR_MS)
}

// One of the 24 hours, or null for anything else. Server actions can be called with anything.
export function asDigestHour(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 23 ? value : null
}

// "08:00 UTC".
export function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00 UTC`
}

export type DigestSchedule = {
  enabled: boolean
  // The UTC hour from which the digest may go out.
  hour: number
  // The UTC day the digest was last sent, or found to have nothing to send.
  checkedDay: number
}

// A digest is due once the hour has come and it has not been handled today. A digest missed at its hour (the server was
// down) goes out later the same day, and never twice in one day.
export function digestDue(schedule: DigestSchedule, now: number): boolean {
  return schedule.enabled && hourOf(now) >= schedule.hour && schedule.checkedDay < dayOf(now)
}

// The `checkedDay` a digest starts with when someone turns it on or changes its hour: if the hour has already passed today,
// today counts as handled, so turning it on never sends a digest straight away.
export function armedDay(hour: number, now: number): number {
  return hourOf(now) >= hour ? dayOf(now) : dayOf(now) - 1
}

// How many digests one pass may send: RHENKO_DIGEST_PER_PASS when it is a whole number from 1 to 200.
export function perPassLimit(env: Record<string, string | undefined>): number {
  const raw = env.RHENKO_DIGEST_PER_PASS?.trim() ?? ""
  const value = /^\d{1,4}$/.test(raw) ? Number(raw) : NaN
  return value >= 1 && value <= MAX_PER_PASS ? value : DEFAULT_PER_PASS
}

// The address the links in a digest point at: RHENKO_PUBLIC_URL, which must be https in production. A digest is mailed, so it
// has no request to read the address from. Outside production, without it, the local server.
export function digestBaseUrl(env: Record<string, string | undefined>): string | null {
  const raw = env.RHENKO_PUBLIC_URL?.trim() ?? ""
  const production = env.NODE_ENV === "production"
  if (!raw) return production ? null : `http://localhost:${env.PORT || 3000}`
  try {
    const url = new URL(raw)
    if (url.protocol !== "https:" && (production || url.protocol !== "http:")) return null
    return url.origin
  } catch {
    return null
  }
}

// One thing in the "Latest" list.
export type DigestItem = {
  kind: DigestKind
  at: number
  // Who and what, in the words the notifications list uses. Never the words of a post or message.
  text: string
  // A path on this site that opens it.
  path: string
  // For a message, its first words. Shown only when message previews are on.
  preview?: string
}

export type DigestInput = {
  // How many of each kind came. A kind that is off is ignored, whatever the count.
  counts: Partial<Record<DigestKind, number>>
  items: DigestItem[]
  // The kinds the person has on. Nothing of any other kind is counted or listed.
  enabled: readonly DigestKind[]
  // "Show message previews" in Settings. Off unless the person turned it on.
  previewsOn: boolean
  // The address people use, with https and no trailing slash.
  baseUrl: string
  // The page that turns the digest off.
  unsubscribeUrl: string
}

export type Digest = { subject: string; text: string; html: string; total: number }

// The digest for what came, or null when nothing did. Counts per kind, then the newest five things with who and what.
export function buildDigest(input: DigestInput): Digest | null {
  const on = new Set<DigestKind>(input.enabled)
  const counts = DIGEST_KINDS.flatMap((kind) => {
    const raw = input.counts[kind]
    const count = on.has(kind) && typeof raw === "number" && Number.isFinite(raw) ? Math.floor(raw) : 0
    return count > 0 ? [{ kind, count }] : []
  })
  const total = counts.reduce((sum, row) => sum + row.count, 0)
  if (total === 0) return null

  // Newest first. The cap comes after the switches, so an item of a kind that is off never uses up a place.
  const items = input.items
    .filter((item) => on.has(item.kind))
    .sort((a, b) => b.at - a.at)
    .slice(0, DIGEST_RECENT)
    .map((item) => ({
      text: oneLine(item.text),
      url: `${input.baseUrl}${item.path.startsWith("/") ? item.path : "/notifications"}`,
      preview: input.previewsOn && item.kind === "message" ? previewOf(item.preview) : "",
    }))

  const open = `${input.baseUrl}/notifications`
  const subject = `Your Rhenko digest: ${total.toLocaleString("en-US")} ${total === 1 ? "thing" : "things"} you missed`
  const why = "You get this once a day because you turned on the daily digest in Settings → Notifications."
  const off = "Turn it off without signing in:"

  const text = [
    "What you missed on Rhenko",
    "",
    ...counts.map((row) => countLabel(row.kind, row.count)),
    "",
    ...(items.length > 0
      ? ["Latest", ...items.flatMap((item) => [`- ${item.text}`, ...(item.preview ? [`  "${item.preview}"`] : []), `  ${item.url}`]), ""]
      : []),
    `Open your notifications: ${open}`,
    "",
    "--",
    why,
    `${off} ${input.unsubscribeUrl}`,
  ].join("\n")

  return { subject, text, html: digestHtml({ counts, items, open, why, off, unsubscribeUrl: input.unsubscribeUrl }), total }
}

type HtmlParts = {
  counts: { kind: DigestKind; count: number }[]
  items: { text: string; url: string; preview: string }[]
  open: string
  why: string
  off: string
  unsubscribeUrl: string
}

// Plain markup with inline styles and no colours of its own: mail apps draw it with their own text and background, so it
// reads the same in a light or a dark one. No images, no scripts, and no tracking pixel.
function digestHtml(parts: HtmlParts): string {
  const link = "color:inherit;text-decoration:underline"
  const list = "margin:0 0 20px;padding:0 0 0 20px"
  const counts = parts.counts.map((row) => `<li style="margin:0 0 4px">${escapeHtml(countLabel(row.kind, row.count))}</li>`).join("")
  const items = parts.items
    .map((item) => {
      const preview = item.preview ? `<br><span style="opacity:0.75">&ldquo;${escapeHtml(item.preview)}&rdquo;</span>` : ""
      return `<li style="margin:0 0 8px"><a href="${escapeHtml(item.url)}" style="${link}">${escapeHtml(item.text)}</a>${preview}</li>`
    })
    .join("")
  return [
    "<!doctype html>",
    '<html lang="en">',
    '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">',
    "<title>Your Rhenko digest</title></head>",
    '<body style="margin:0;padding:0">',
    '<div style="max-width:520px;margin:0 auto;padding:24px 16px;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5">',
    '<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3">What you missed on Rhenko</h1>',
    `<ul style="${list}">${counts}</ul>`,
    ...(parts.items.length > 0
      ? ['<h2 style="margin:0 0 8px;font-size:16px;line-height:1.3">Latest</h2>', `<ul style="${list}">${items}</ul>`]
      : []),
    `<p style="margin:0 0 24px"><a href="${escapeHtml(parts.open)}" style="${link};font-weight:600">Open your notifications</a></p>`,
    '<hr style="border:0;border-top:1px solid rgba(128,128,128,0.4);margin:0 0 16px">',
    `<p style="margin:0 0 8px;font-size:13px;line-height:1.5;opacity:0.75">${escapeHtml(parts.why)}</p>`,
    `<p style="margin:0;font-size:13px;line-height:1.5;opacity:0.75">${escapeHtml(parts.off)} <a href="${escapeHtml(parts.unsubscribeUrl)}" style="${link}">Turn off the daily digest</a></p>`,
    "</div></body></html>",
  ].join("\n")
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")
}

// One line, with runs of spaces and breaks folded to a single space, so a name cannot start a line of its own.
function oneLine(value: string): string {
  const plain = [...value].map((char) => (char < " " || char === "\u007f" ? " " : char)).join("")
  return plain.replace(/\s+/g, " ").trim()
}

function previewOf(value: string | undefined): string {
  const chars = [...oneLine(value ?? "")]
  return chars.length > PREVIEW_MAX ? `${chars.slice(0, PREVIEW_MAX - 1).join("")}…` : chars.join("")
}

// The link that turns the digest off, and the same address as a one-click POST target (RFC 8058). The token (lib/digest-token.ts)
// is the only thing in either: no one has to sign in.
export function unsubscribePageUrl(baseUrl: string, token: string): string {
  return `${baseUrl}/unsubscribe?t=${encodeURIComponent(token)}`
}

export function unsubscribePostUrl(baseUrl: string, token: string): string {
  return `${baseUrl}/api/digest/unsubscribe?t=${encodeURIComponent(token)}`
}

// The headers that let a mail app offer "Unsubscribe" beside the sender (List-Unsubscribe, with RFC 8058 one-click), and mark
// the message as automatic so replies and out-of-office answers are not sent back to it.
export function digestHeaders(postUrl: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${postUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    "Auto-Submitted": "auto-generated",
  }
}
