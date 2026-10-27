// Unit checks for the daily email digest (lib/digest-rules.ts and lib/digest-token.ts): what the digest says (counts per kind, the newest five, no
// message words unless previews are on), which kinds it leaves out, when one is due and that it is due once a day, and the
// signed unsubscribe link. The queries that read blocks, mutes and unread state are SQL in lib/digest.ts and need a database.
// Run with: npm run test:unit

import { test } from "node:test"
import assert from "node:assert/strict"
import {
  armedDay,
  asDigestHour,
  buildDigest,
  countLabel,
  DAY_MS,
  DEFAULT_PER_PASS,
  dayOf,
  digestBaseUrl,
  digestDue,
  digestHeaders,
  DIGEST_KINDS,
  DIGEST_RECENT,
  enabledKinds,
  hourLabel,
  hourOf,
  perPassLimit,
  unsubscribePageUrl,
  unsubscribePostUrl,
} from "../lib/digest-rules.ts"
import { readUnsubscribeToken, signUnsubscribeToken, UNSUBSCRIBE_DAYS } from "../lib/digest-token.ts"
import { messageLine, messagePush, NOTICE, noticeLine } from "../lib/notify-rules.ts"

const BASE = "https://rhenko.example.com"
const OFF_LINK = `${BASE}/unsubscribe?t=abc`
const SECRET = "meet me at the station at 9"
const ALL = DIGEST_KINDS

function item(kind, at, text = `Person ${at} ${NOTICE[kind] ?? "sent you a message"}`, extra = {}) {
  return { kind, at, text, path: `/p/${at}`, ...extra }
}

function build(overrides = {}) {
  return buildDigest({
    counts: { like: 1 },
    items: [item("like", 1)],
    enabled: ALL,
    previewsOn: false,
    baseUrl: BASE,
    unsubscribeUrl: OFF_LINK,
    ...overrides,
  })
}

test("the digest counts each kind, in the order of the switches in Settings, and leaves out kinds with none", () => {
  const digest = build({ counts: { message: 4, like: 12, follow: 2, repost: 1, reply: 3, mention: 1 }, items: [] })
  assert.ok(digest)
  const lines = ["12 likes", "1 repost", "3 replies", "2 new followers", "1 mention", "4 messages"]
  const at = lines.map((line) => digest.text.indexOf(line))
  assert.ok(at.every((index) => index >= 0), `every count appears: ${at}`)
  assert.deepEqual([...at].sort((a, b) => a - b), at, "in the settings order, messages last")
  assert.equal(digest.total, 23)
  assert.equal(digest.subject, "Your Rhenko digest: 23 things you missed")
  assert.ok(!/quote|poll result|follow request|new post/.test(digest.text))
  assert.ok(!digest.text.includes("Latest") && !digest.html.includes("Latest"), "no empty list")
  assert.equal(countLabel("like", 1), "1 like")
  assert.equal(countLabel("reply", 1), "1 reply")
  assert.equal(countLabel("follow", 1), "1 new follower")
  assert.equal(countLabel("like", 1200), "1,200 likes")
  assert.equal(build({ counts: { like: 1 } }).subject, "Your Rhenko digest: 1 thing you missed")
})

test("the newest five are listed, newest first, and the rest are only in the counts", () => {
  const items = [3, 8, 1, 6, 2, 7, 5, 4].map((at) => item("like", at, `Liker${at} liked your post`))
  const digest = build({ counts: { like: 8 }, items })
  assert.ok(digest)
  assert.equal(DIGEST_RECENT, 5)
  const listed = [...digest.text.matchAll(/^- (Liker\d) liked your post$/gm)].map((match) => match[1])
  assert.deepEqual(listed, ["Liker8", "Liker7", "Liker6", "Liker5", "Liker4"])
  assert.ok(digest.text.includes("8 likes"))
  assert.ok(!digest.text.includes("Liker3") && !digest.html.includes("Liker3"))
  assert.equal([...digest.html.matchAll(/<li style="margin:0 0 8px"><a /g)].length, 5)
})

test("items read as the in-app notifications do, and open the page their row opens", () => {
  for (const kind of Object.keys(NOTICE)) {
    assert.equal(noticeLine(kind, "Maan"), kind === "poll" ? NOTICE.poll : `Maan ${NOTICE[kind]}`)
  }
  assert.equal(noticeLine("like", "Maan"), "Maan liked your post")
  assert.equal(noticeLine("follow", "Maan"), "Maan followed you")
  assert.equal(noticeLine("poll", "Maan"), "A poll you voted in has ended")
  const digest = build({ items: [item("like", 5, noticeLine("like", "Maan"), { path: "/asha/status/p1" })] })
  assert.ok(digest.text.includes("- Maan liked your post"))
  assert.ok(digest.text.includes(`  ${BASE}/asha/status/p1`))
  assert.ok(digest.html.includes(`href="${BASE}/asha/status/p1"`))
  // The same words a push uses for a message.
  assert.equal(messageLine(false, false), "sent you a message")
  assert.equal(messageLine(true, false), "sent a message")
  assert.equal(messageLine(false, true), "sent you a message request")
  const push = messagePush({ conversationId: "c1", senderName: "Maan", isGroup: false, groupTitle: "", request: false, preview: SECRET, previewsOn: false })
  assert.equal(push.body, messageLine(false, false))
  // A path that is not on this site is never linked.
  assert.ok(build({ items: [item("like", 5, "x liked your post", { path: "https://evil.example/" })] }).text.includes(`  ${BASE}/notifications`))
})

test("message words are left out unless previews are on, and a post's words never appear", () => {
  const message = item("message", 9, "Maan sent you a message", { preview: SECRET })
  const like = item("like", 8, "Asha liked your post", { preview: "words of a post" })
  const off = build({ counts: { message: 1, like: 1 }, items: [message, like] })
  assert.ok(off)
  for (const part of [off.subject, off.text, off.html]) {
    assert.ok(!part.includes(SECRET), "no message text by default")
    assert.ok(!part.includes("words of a post"))
  }
  assert.ok(off.text.includes("Maan sent you a message"))
  const on = build({ counts: { message: 1, like: 1 }, items: [message, like], previewsOn: true })
  assert.ok(on.text.includes(`"${SECRET}"`))
  assert.ok(on.html.includes(SECRET))
  assert.ok(!on.text.includes("words of a post") && !on.html.includes("words of a post"), "previews are for messages only")
  assert.ok(!on.subject.includes(SECRET), "never in the subject")
  // A long preview is cut, and line breaks in it cannot start a line of their own.
  const long = build({ counts: { message: 1 }, items: [item("message", 1, "Maan sent you a message", { preview: `a\n\nb${"x".repeat(300)}` })], previewsOn: true })
  const quoted = long.text.split("\n").find((line) => line.startsWith('  "a b'))
  assert.ok(quoted && quoted.length <= 150 && quoted.endsWith('…"'))
})

test("a switched-off kind is never counted or listed, and does not use up a place in the five", () => {
  assert.deepEqual(enabledKinds({}), [...ALL])
  assert.ok(!enabledKinds({ like: false }).includes("like"))
  assert.ok(enabledKinds({ message: false }).includes("message"), "messages have no switch")
  assert.ok(enabledKinds({ like: false, repost: false }).includes("reply"))
  const enabled = enabledKinds({ like: false })
  const items = [
    ...[10, 9, 8, 7].map((at) => item("like", at, `Liker${at} liked your post`)),
    ...[6, 5, 4, 3, 2, 1].map((at) => item("reply", at, `Replier${at} replied to you`)),
  ]
  const digest = build({ counts: { like: 4, reply: 6 }, items, enabled })
  assert.ok(digest)
  assert.equal(digest.total, 6)
  assert.ok(!/\blikes?\b/i.test(digest.text) && !digest.text.includes("Liker"), "nothing about likes")
  assert.ok(!digest.html.includes("Liker"))
  const listed = [...digest.text.matchAll(/^- (Replier\d)/gm)].map((match) => match[1])
  assert.deepEqual(listed, ["Replier6", "Replier5", "Replier4", "Replier3", "Replier2"], "five replies, not the likes")
  // When everything that came is switched off, there is no digest.
  assert.equal(build({ counts: { like: 4 }, items: [item("like", 1)], enabled: enabledKinds({ like: false }) }), null)
  assert.equal(build({ counts: { message: 2 }, items: [], enabled: ALL.filter((kind) => kind !== "message") }), null)
})

test("nothing new means no digest", () => {
  assert.equal(build({ counts: {}, items: [] }), null)
  assert.equal(build({ counts: { like: 0, reply: 0 }, items: [item("like", 1)] }), null)
  assert.equal(build({ counts: { like: -3, reply: Number.NaN, repost: Infinity } }), null)
  assert.ok(build({ counts: { like: 2.9 } }).text.includes("2 likes"))
})

test("the HTML is plain: escaped, no images, scripts or tracking pixel, and no colours of its own", () => {
  const digest = build({ items: [item("like", 1, '<img src="https://t.example/p.gif"> & "Maan" liked your post')] })
  assert.ok(digest)
  assert.ok(digest.html.startsWith("<!doctype html>"))
  assert.ok(!/<img|<script|<link|<iframe|<form|url\(|@import/i.test(digest.html), "nothing to load")
  assert.ok(!/<[^>]*\ssrc\s*=/i.test(digest.html), "no tag loads anything")
  assert.ok(digest.html.includes("&lt;img src=&quot;https://t.example/p.gif&quot;&gt; &amp; &quot;Maan&quot; liked your post"))
  assert.ok(!/(^|[^-])color\s*:\s*(#|rgb|[a-z]+;)/i.test(digest.html.replace(/color:inherit/g, "")), "text colour comes from the mail app")
  assert.ok(!/background/i.test(digest.html))
  assert.ok(digest.html.includes('name="color-scheme" content="light dark"'))
  // Only links to this site and the unsubscribe page.
  const links = [...digest.html.matchAll(/href="([^"]+)"/g)].map((match) => match[1])
  assert.ok(links.length > 0 && links.every((link) => link.startsWith(BASE)))
  assert.ok(links.includes(OFF_LINK))
  // A name with a line break cannot start a line of its own in the text part.
  const split = build({ items: [item("like", 1, "Maan\nBCC: x@y.example liked your post")] })
  assert.ok(split.text.includes("- Maan BCC: x@y.example liked your post"))
})

test("every digest has the unsubscribe link in both parts and the one-click headers", () => {
  const digest = build()
  assert.ok(digest.text.includes(`Turn it off without signing in: ${OFF_LINK}`))
  assert.ok(digest.html.includes(`href="${OFF_LINK}"`))
  assert.ok(digest.text.includes("Settings → Notifications"))
  const token = signUnsubscribeToken("u1", "k", Date.UTC(2026, 9, 27))
  assert.equal(unsubscribePageUrl(BASE, token), `${BASE}/unsubscribe?t=${encodeURIComponent(token)}`)
  const post = unsubscribePostUrl(BASE, token)
  assert.equal(post, `${BASE}/api/digest/unsubscribe?t=${encodeURIComponent(token)}`)
  const headers = digestHeaders(post)
  assert.equal(headers["List-Unsubscribe"], `<${post}>`)
  assert.equal(headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click")
  assert.equal(headers["Auto-Submitted"], "auto-generated")
  assert.ok(Object.values(headers).every((value) => !/[\r\n]/.test(value)))
})

test("a digest is due once the person's UTC hour has come, and only once a day", () => {
  const day = Date.UTC(2026, 9, 27)
  const at = (hour, minute = 0) => day + hour * 3_600_000 + minute * 60_000
  const schedule = { enabled: true, hour: 8, checkedDay: dayOf(day) - 1 }
  assert.equal(hourOf(at(7, 59)), 7)
  assert.equal(digestDue(schedule, at(7, 59)), false, "not before the hour")
  assert.equal(digestDue(schedule, at(8)), true)
  assert.equal(digestDue(schedule, at(23, 59)), true, "a digest missed at its hour still goes out that day")
  assert.equal(digestDue({ ...schedule, enabled: false }, at(9)), false)
  assert.equal(digestDue({ ...schedule, checkedDay: dayOf(day) }, at(9)), false, "already handled today")
  assert.equal(digestDue({ ...schedule, checkedDay: dayOf(day) }, day + DAY_MS), false, "tomorrow before the hour")
  assert.equal(digestDue({ ...schedule, checkedDay: dayOf(day) }, day + DAY_MS + 8 * 3_600_000), true, "and again tomorrow")

  // Run the pass every 15 seconds for three days. The only state is the stored record, as in the database, so a restart
  // cannot send a second one. On the second day the server is down from 08:00 to 13:00: that digest goes out at 13:00, once.
  const stored = { ...schedule }
  const sent = []
  for (let now = day; now < day + 3 * DAY_MS; now += 15_000) {
    if (now >= day + DAY_MS + 8 * 3_600_000 && now < day + DAY_MS + 13 * 3_600_000) continue
    if (digestDue(stored, now)) {
      stored.checkedDay = dayOf(now)
      sent.push(now)
    }
  }
  assert.deepEqual(sent.map((time) => dayOf(time)), [dayOf(day), dayOf(day) + 1, dayOf(day) + 2], "one a day")
  assert.deepEqual(sent.map((time) => hourOf(time)), [8, 13, 8])
})

test("turning the digest on never sends one straight away", () => {
  const day = Date.UTC(2026, 9, 27)
  const at = (hour) => day + hour * 3_600_000
  // Turned on at 15:00 for 08:00: today's slot has passed, so the first is tomorrow.
  assert.equal(armedDay(8, at(15)), dayOf(day))
  assert.equal(digestDue({ enabled: true, hour: 8, checkedDay: armedDay(8, at(15)) }, at(15)), false)
  assert.equal(digestDue({ enabled: true, hour: 8, checkedDay: armedDay(8, at(15)) }, day + DAY_MS + 8 * 3_600_000), true)
  // Turned on at 06:00 for 08:00: it goes out today at 08:00.
  assert.equal(armedDay(8, at(6)), dayOf(day) - 1)
  assert.equal(digestDue({ enabled: true, hour: 8, checkedDay: armedDay(8, at(6)) }, at(7)), false)
  assert.equal(digestDue({ enabled: true, hour: 8, checkedDay: armedDay(8, at(6)) }, at(8)), true)
})

test("the hour is one of 24, the pass has a cap, and the links use the public address", () => {
  assert.equal(asDigestHour(0), 0)
  assert.equal(asDigestHour(23), 23)
  for (const bad of [-1, 24, 8.5, "8", null, undefined, Number.NaN]) assert.equal(asDigestHour(bad), null)
  assert.equal(hourLabel(8), "08:00 UTC")
  assert.equal(hourLabel(17), "17:00 UTC")
  assert.equal(perPassLimit({}), DEFAULT_PER_PASS)
  assert.equal(perPassLimit({ RHENKO_DIGEST_PER_PASS: "40" }), 40)
  assert.equal(perPassLimit({ RHENKO_DIGEST_PER_PASS: "200" }), 200)
  for (const bad of ["0", "201", "-5", "2.5", "many", "", " "]) assert.equal(perPassLimit({ RHENKO_DIGEST_PER_PASS: bad }), DEFAULT_PER_PASS)
  assert.equal(digestBaseUrl({ NODE_ENV: "production", RHENKO_PUBLIC_URL: "https://rhenko.example.com/" }), "https://rhenko.example.com")
  assert.equal(digestBaseUrl({ NODE_ENV: "production", RHENKO_PUBLIC_URL: "http://rhenko.example.com" }), null)
  assert.equal(digestBaseUrl({ NODE_ENV: "production" }), null)
  assert.equal(digestBaseUrl({ NODE_ENV: "production", RHENKO_PUBLIC_URL: "not a url" }), null)
  assert.equal(digestBaseUrl({ NODE_ENV: "development", PORT: "3100" }), "http://localhost:3100")
  assert.equal(digestBaseUrl({ NODE_ENV: "development", RHENKO_PUBLIC_URL: "http://localhost:3000" }), "http://localhost:3000")
})

test("the unsubscribe token names the account, is signed, and runs out", () => {
  const now = Date.UTC(2026, 9, 27, 8)
  const token = signUnsubscribeToken("user-1234", "key-a", now)
  assert.deepEqual(readUnsubscribeToken(token, "key-a", now), { ok: true, userId: "user-1234" })
  assert.deepEqual(readUnsubscribeToken(token, "key-a", now + (UNSUBSCRIBE_DAYS * DAY_MS - 1)), { ok: true, userId: "user-1234" })
  assert.deepEqual(readUnsubscribeToken(token, "key-a", now + UNSUBSCRIBE_DAYS * DAY_MS), { ok: false, reason: "expired" })
  assert.deepEqual(readUnsubscribeToken(token, "key-a", now + 400 * DAY_MS), { ok: false, reason: "expired" })
  assert.deepEqual(readUnsubscribeToken(signUnsubscribeToken("user-1234", "key-a", now, 1), "key-a", now + DAY_MS), { ok: false, reason: "expired" })
  assert.ok(token.length < 200 && /^[A-Za-z0-9._-]+$/.test(token), "safe in a URL")
  // A token made with another key, or changed in any part, is invalid, not expired.
  assert.deepEqual(readUnsubscribeToken(token, "key-b", now), { ok: false, reason: "invalid" })
  const [version, user, stamp, signature] = token.split(".")
  const invalid = { ok: false, reason: "invalid" }
  assert.deepEqual(readUnsubscribeToken([version, "user-9999", stamp, signature].join("."), "key-a", now), invalid, "another account")
  assert.deepEqual(readUnsubscribeToken([version, user, (Number.parseInt(stamp, 36) + 1).toString(36), signature].join("."), "key-a", now), invalid, "a later expiry")
  assert.deepEqual(readUnsubscribeToken([version, user, stamp, `${signature.slice(0, -1)}${signature.endsWith("A") ? "B" : "A"}`].join("."), "key-a", now), invalid)
  assert.deepEqual(readUnsubscribeToken([version, user, stamp, signature.slice(0, -1)].join("."), "key-a", now), invalid, "short signature")
  assert.deepEqual(readUnsubscribeToken(["v2", user, stamp, signature].join("."), "key-a", now), invalid, "unknown version")
  for (const junk of ["", "v1", "v1...", "a.b.c.d", `${token}.x`, `${token}${"a".repeat(400)}`, null, undefined, 42, {}, ["x"], "v1.user-1234.zz!.sig", "v1.us er.abc.sig"]) {
    assert.deepEqual(readUnsubscribeToken(junk, "key-a", now), invalid, `rejects ${JSON.stringify(junk)}`)
  }
  // A token made for one purpose can't be forged from another account's: the account is part of what is signed.
  const other = signUnsubscribeToken("user-5678", "key-a", now)
  assert.notEqual(other.split(".")[3], signature)
  assert.deepEqual(readUnsubscribeToken(other, "key-a", now), { ok: true, userId: "user-5678" })
})
