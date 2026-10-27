import { all, get, run } from "@/lib/db"
import { canSeePost, DM_BLOCKED, notFromBlocked, SHOWN_NOTIFICATION, unexpired, type NotificationKind } from "@/lib/data"
import {
  armedDay,
  asDigestHour,
  buildDigest,
  dayOf,
  DEFAULT_DIGEST_HOUR,
  DIGEST_RECENT,
  digestBaseUrl,
  digestHeaders,
  enabledKinds,
  hourOf,
  perPassLimit,
  SETTLE_MS,
  unsubscribePageUrl,
  unsubscribePostUrl,
  type DigestItem,
  type DigestKind,
} from "@/lib/digest-rules"
import { readUnsubscribeToken, signUnsubscribeToken, type TokenCheck } from "@/lib/digest-token"
import { sendMail } from "@/lib/mail"
import { isVoiceFile } from "@/lib/media-names"
import { messageLine, noticeLine, notificationUrl } from "@/lib/notify-rules"
import { consume } from "@/lib/rate-limit"
import { BANNER_PREVIEW_MAX } from "@/lib/rules"
import { keyedHash } from "@/lib/secrets"
import { emailReady, notificationPrefsFor } from "@/lib/settings-data"

// The daily email digest. A person who turns it on gets one email a day, at the UTC hour they chose, with what they missed:
// a count for each kind of notification and for messages, and the newest five with who and what. The maintenance pass sends
// them (sendDueDigests). It needs SMTP, RHENKO_PUBLIC_URL for the links, and RHENKO_SECRET to sign the unsubscribe link.

const MINUTE_MS = 60 * 1000
// Candidates looked at per digest that may be sent: most are found to have nothing new, and cost no mail.
const SCAN_PER_SEND = 4
// A pass stops starting digests after this long, so one slow mail server cannot hold it for minutes.
const PASS_BUDGET_MS = 10 * 1000
// After this many failures in a row (a send, or a digest that could not be built) the pass stops, and no digests go out for
// PAUSE_MS: the mail server or the database is in trouble.
const MAX_FAILURES = 3
const PAUSE_MS = 10 * MINUTE_MS
const WARN_EVERY_MS = 60 * MINUTE_MS

// The key the unsubscribe links are signed with, made from RHENKO_SECRET. Null when the secret is not set.
function signingKey(): string | null {
  try {
    return keyedHash("digest-unsubscribe", "key-v1")
  } catch {
    return null
  }
}

// Whether this server can send digests, and what is missing when it can't.
function readiness(): { base: string; key: string } | { missing: string } {
  if (!emailReady()) return { missing: "RHENKO_SMTP_URL" }
  const base = digestBaseUrl(process.env)
  if (!base) return { missing: "RHENKO_PUBLIC_URL (with https)" }
  const key = signingKey()
  if (!key) return { missing: "RHENKO_SECRET (16 characters or more)" }
  return { base, key }
}

export function digestAvailable(): boolean {
  return "base" in readiness()
}

// `chosen` is false until the person first turns the digest on, so the page can suggest an hour from their own clock.
export type DigestSettings = { enabled: boolean; chosen: boolean; hour: number; lastSentAt: number | null }

export async function digestSettingsFor(userId: string): Promise<DigestSettings> {
  const row = await get<{ enabled: number; send_hour: number; last_sent_at: number | null }>(
    "SELECT enabled, send_hour, last_sent_at FROM email_digests WHERE user_id = ?",
    userId
  )
  return {
    enabled: row?.enabled === 1,
    chosen: row !== undefined,
    hour: asDigestHour(row?.send_hour) ?? DEFAULT_DIGEST_HOUR,
    lastSentAt: row?.last_sent_at ?? null,
  }
}

// Turns the digest on at `hour` (UTC), or off. Turning it on starts the digest's window now, and when that hour has already
// passed today it waits for tomorrow, so it never sends straight away. Turning it off keeps the row: the record of the last
// send is what stops a second digest in the same day.
export async function saveDigestChoice(userId: string, on: boolean, hour: number, now = Date.now()): Promise<void> {
  if (!on) {
    await run("UPDATE email_digests SET enabled = 0 WHERE user_id = ?", userId)
    return
  }
  await run(
    `INSERT INTO email_digests (user_id, enabled, send_hour, checked_day, covered_until) VALUES (?, 1, ?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET
       covered_until = CASE WHEN email_digests.enabled = 0 THEN excluded.covered_until ELSE email_digests.covered_until END,
       enabled = 1,
       send_hour = excluded.send_hour,
       checked_day = GREATEST(email_digests.checked_day, excluded.checked_day)`,
    userId,
    hour,
    armedDay(hour, now),
    now
  )
}

// What the unsubscribe page shows: whether the link in the address is good. No side effects.
export function checkUnsubscribeToken(token: unknown, now = Date.now()): TokenCheck {
  const key = signingKey()
  if (!key) return { ok: false, reason: "invalid" }
  return readUnsubscribeToken(token, key, now)
}

export type UnsubscribeResult = "done" | "invalid" | "expired" | "limited"

// Turns the digest off for the account the token names. It works with no sign-in: the token is the proof, and it can do
// nothing else. Doing it twice does no harm.
export async function unsubscribeWithToken(token: unknown, now = Date.now()): Promise<UnsubscribeResult> {
  const checked = checkUnsubscribeToken(token, now)
  if (!checked.ok) return checked.reason
  if (!(await consume(`digest-off:${checked.userId}`, 10, 60 * MINUTE_MS, now)).ok) return "limited"
  await run("UPDATE email_digests SET enabled = 0 WHERE user_id = ?", checked.userId)
  return "done"
}

type Due = { user_id: string; covered_until: number; email: string; handle: string; previews: number }

let running = false
let pausedUntil = 0
let warnedAt = 0

// Run by the maintenance pass. Sends the digests that are due, a few at a time, in the background: the pass doesn't wait for
// the mail server. Each digest is claimed in the database before it is sent, so it goes out once a day even if two servers
// run this at the same moment or the server restarts half way. A digest that fails to send is not tried again that day; the
// next one covers what it would have said.
export async function sendDueDigests(now = Date.now()): Promise<{ sent: number; skipped: number }> {
  const result = { sent: 0, skipped: 0 }
  if (running || now < pausedUntil) return result
  running = true
  try {
    const limit = perPassLimit(process.env)
    const due = await all<Due>(
      `SELECT d.user_id, d.covered_until, u.email, u.handle, u.push_previews AS previews
       FROM email_digests d JOIN users u ON u.id = d.user_id
       WHERE d.enabled = 1 AND d.send_hour <= ? AND d.checked_day < ?
         AND u.email IS NOT NULL AND u.email_verified_at IS NOT NULL AND u.deactivated_at IS NULL
       ORDER BY d.send_hour, d.user_id LIMIT ?`,
      hourOf(now),
      dayOf(now),
      limit * SCAN_PER_SEND
    )
    if (due.length === 0) return result
    const ready = readiness()
    if (!("base" in ready)) {
      if (now - warnedAt >= WARN_EVERY_MS) {
        warnedAt = now
        console.error(`[digest] ${due.length} daily digests are due but can't be sent: ${ready.missing} is not set.`)
      }
      return result
    }

    const started = Date.now()
    let failures = 0
    for (const person of due) {
      if (result.sent >= limit || Date.now() - started > PASS_BUDGET_MS) break
      try {
        const outcome = await sendOne(person, now, ready)
        if (outcome === "skipped") result.skipped++
        if (outcome === "sent") result.sent++
        if (outcome === "failed") failures++
        else if (outcome !== "raced") failures = 0
      } catch (error) {
        console.error("[digest] could not build a digest", error)
        failures++
        // Today is given up for this person, so one digest that can't be built doesn't hold up the rest of the queue.
        await run("UPDATE email_digests SET checked_day = ? WHERE user_id = ? AND checked_day < ?", dayOf(now), person.user_id, dayOf(now)).catch(() => {})
      }
      if (failures >= MAX_FAILURES) {
        pausedUntil = Date.now() + PAUSE_MS
        console.error(`[digest] ${failures} digests failed in a row; digests are paused for ${PAUSE_MS / MINUTE_MS} minutes.`)
        break
      }
    }
  } finally {
    running = false
  }
  return result
}

// One person's digest: read what is new, claim today's slot, send. Nothing is claimed until the digest is built, so a
// failure in building it costs nobody their digest.
async function sendOne(person: Due, now: number, ready: { base: string; key: string }): Promise<"sent" | "skipped" | "failed" | "raced"> {
  const until = now - SETTLE_MS
  const today = dayOf(now)
  const claim = `UPDATE email_digests SET checked_day = ?, covered_until = GREATEST(covered_until, ?)
                 WHERE user_id = ? AND enabled = 1 AND checked_day < ? RETURNING user_id`
  const previewsOn = person.previews === 1
  const enabled = enabledKinds(await notificationPrefsFor(person.user_id))
  const found = until > person.covered_until ? await contentFor(person, person.covered_until, until, previewsOn, enabled) : null
  const token = signUnsubscribeToken(person.user_id, ready.key, now)
  const digest = found
    ? buildDigest({ ...found, enabled, previewsOn, baseUrl: ready.base, unsubscribeUrl: unsubscribePageUrl(ready.base, token) })
    : null

  // Nothing new: today is handled, and the window moves on.
  if (!digest) return (await get(claim, today, until, person.user_id, today)) ? "skipped" : "raced"

  // The window moves on only once the mail has gone, but today is claimed before it is sent: at most one a day.
  const claimed = await get(
    "UPDATE email_digests SET checked_day = ? WHERE user_id = ? AND enabled = 1 AND checked_day < ? RETURNING user_id",
    today,
    person.user_id,
    today
  )
  if (!claimed) return "raced"
  const sent = await sendMail({
    to: person.email,
    subject: digest.subject,
    text: digest.text,
    html: digest.html,
    headers: digestHeaders(unsubscribePostUrl(ready.base, token)),
  })
  if (!sent.ok) {
    console.error(`[digest] could not send to @${person.handle}: ${sent.error}`)
    return "failed"
  }
  await run("UPDATE email_digests SET covered_until = GREATEST(covered_until, ?), last_sent_at = ? WHERE user_id = ?", until, Date.now(), person.user_id)
  return "sent"
}

type Found = { counts: Partial<Record<DigestKind, number>>; items: DigestItem[] }

// What came for a person in (from, to]: unread, from kinds they have on, and from people they haven't muted or blocked. The
// notifications are the rows their notifications list shows, so the same rules apply. A message counts when the unread badge
// would count it, and its conversation isn't muted; messages from a muted account don't count, as they don't push. The words
// of a post are never read; a message's words are read only when previews are on.
async function contentFor(person: Due, from: number, to: number, previewsOn: boolean, enabled: readonly DigestKind[]): Promise<Found> {
  const counts: Partial<Record<DigestKind, number>> = {}
  const items: DigestItem[] = []
  const kinds = enabled.filter((kind): kind is NotificationKind => kind !== "message")

  if (kinds.length > 0) {
    const where = `${SHOWN_NOTIFICATION} AND n.read = 0 AND n.created_at > ? AND n.created_at <= ? AND n.kind IN (${kinds.map(() => "?").join(", ")})`
    const params = [person.user_id, from, to, ...kinds]
    const byKind = await all<{ kind: NotificationKind; c: number }>(
      `SELECT n.kind, COUNT(*) AS c FROM notifications n JOIN users u ON u.id = n.actor_id WHERE ${where} GROUP BY n.kind`,
      ...params
    )
    for (const row of byKind) counts[row.kind] = row.c
    const newest = await all<{ kind: NotificationKind; created_at: number; post_id: string | null; actor_id: string; name: string; handle: string }>(
      `SELECT n.kind, n.created_at, n.post_id, u.id AS actor_id, u.name, u.handle
       FROM notifications n JOIN users u ON u.id = n.actor_id
       WHERE ${where} ORDER BY n.created_at DESC, n.id DESC LIMIT ${DIGEST_RECENT}`,
      ...params
    )
    for (const row of newest) {
      const postVisible = row.post_id !== null && (await canSeePost(row.post_id, person.user_id))
      items.push({
        kind: row.kind,
        at: row.created_at,
        text: noticeLine(row.kind, row.name),
        path: notificationUrl({
          kind: row.kind,
          actor: { id: row.actor_id, name: row.name, handle: row.handle },
          recipientHandle: person.handle,
          postId: row.post_id,
          postVisible,
        }),
      })
    }
  }

  if (enabled.includes("message")) {
    const base = `FROM chat_messages m
       JOIN conversation_members cm ON cm.conversation_id = m.conversation_id AND cm.user_id = ?
       JOIN conversations c ON c.id = m.conversation_id`
    const where = `cm.status = 'accepted' AND cm.muted = 0 AND m.sender_id <> ? AND m.created_at > cm.last_read_at AND m.deleted_at IS NULL
       AND m.call_status IS NULL AND m.timer_change IS NULL AND m.created_at > ? AND m.created_at <= ?
       AND ${notFromBlocked("m.sender_id")} AND NOT (${DM_BLOCKED}) AND ${unexpired("m")}
       AND NOT EXISTS (SELECT 1 FROM mutes mu WHERE mu.muter_id = ? AND mu.muted_id = m.sender_id)`
    const me = person.user_id
    const params = [me, me, from, to, me, me, me, me, me, Date.now(), me]
    const total = (await get<{ c: number }>(`SELECT COUNT(*) AS c ${base} WHERE ${where}`, ...params))?.c ?? 0
    if (total > 0) counts.message = total
    if (total > 0) {
      const latest = await all<{
        conversation_id: string
        created_at: number
        body: string
        media_file: string | null
        post_id: string | null
        kind: "dm" | "group"
        title: string
        sender_name: string
      }>(
        `SELECT * FROM (
           SELECT DISTINCT ON (m.conversation_id) m.conversation_id, m.created_at, ${previewsOn ? "m.body" : "''::text"} AS body,
             m.media_file, m.post_id, c.kind, c.title, su.name AS sender_name
           ${base} JOIN users su ON su.id = m.sender_id
           WHERE ${where}
           ORDER BY m.conversation_id, m.created_at DESC, m.id DESC
         ) latest ORDER BY created_at DESC LIMIT ${DIGEST_RECENT}`,
        ...params
      )
      for (const row of latest) {
        const group = row.kind === "group"
        const line = messageLine(group, false)
        items.push({
          kind: "message",
          at: row.created_at,
          text: `${row.sender_name} ${line}${group && row.title ? ` in ${row.title}` : ""}`,
          path: `/messages/${encodeURIComponent(row.conversation_id)}`,
          ...(previewsOn ? { preview: messagePreview(row.body, row.media_file, row.post_id !== null) } : {}),
        })
      }
    }
  }
  return { counts, items }
}

// What the conversation list shows for a message: its first words, or what it carries.
function messagePreview(body: string, mediaFile: string | null, hasPost: boolean): string {
  const chars = [...body.trim()]
  if (chars.length > 0) return chars.length > BANNER_PREVIEW_MAX ? `${chars.slice(0, BANNER_PREVIEW_MAX - 1).join("")}…` : chars.join("")
  if (mediaFile) return isVoiceFile(mediaFile) ? "Sent a voice message" : "Sent a photo"
  return hasPost ? "Shared a post" : ""
}
