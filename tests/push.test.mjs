// Unit checks for push in lib/notify-rules.ts: what a push says (who and what happened, never a message's words unless
// previews are on), which events may notify at all, and what the server accepts as VAPID keys and as a subscription.
// Run with: npm run test:unit

import { test } from "node:test"
import assert from "node:assert/strict"
import {
  callPush,
  checkPushSubscription,
  groupAddPush,
  mayNotify,
  messagePush,
  notificationPush,
  NOTICE,
  pushEventKey,
  vapidConfig,
} from "../lib/notify-rules.ts"

const maan = { id: "u-maan", name: "Maan", handle: "maan" }
const SECRET = "meet me at the station at 9"

function message(overrides = {}) {
  return {
    conversationId: "c1",
    senderName: "Maan",
    isGroup: false,
    groupTitle: "",
    request: false,
    mention: false,
    preview: SECRET,
    previewsOn: false,
    ...overrides,
  }
}

test("a notification push names who acted and what they did", () => {
  const push = notificationPush({ kind: "like", actor: maan, recipientHandle: "asha", postId: "p1", postVisible: true })
  assert.equal(push.title, "Maan")
  assert.equal(push.body, "liked your post")
  assert.equal(`${push.title} ${push.body}`, "Maan liked your post")
  for (const kind of Object.keys(NOTICE)) {
    const each = notificationPush({ kind, actor: maan, recipientHandle: "asha", postId: "p1", postVisible: true })
    assert.equal(each.title, "Maan")
    assert.equal(each.body, NOTICE[kind])
  }
})

test("a notification push opens the page its row opens", () => {
  const open = (kind, postId = "p1", postVisible = true) =>
    notificationPush({ kind, actor: maan, recipientHandle: "asha", postId, postVisible }).url
  assert.equal(open("like"), "/asha/status/p1")
  assert.equal(open("repost"), "/asha/status/p1")
  assert.equal(open("reply"), "/maan/status/p1")
  assert.equal(open("mention"), "/maan/status/p1")
  assert.equal(open("post"), "/maan/status/p1")
  assert.equal(open("follow", null), "/maan")
  assert.equal(open("follow_request", null), "/notifications")
  // A post hidden from the recipient is never linked.
  assert.equal(open("reply", "p1", false), "/maan")
})

test("pushes for the same post or conversation share a tag, so the newest replaces the last", () => {
  const like = (actor) => notificationPush({ kind: "like", actor, recipientHandle: "asha", postId: "p1", postVisible: true })
  assert.equal(like(maan).tag, like({ id: "u-ravi", name: "Ravi", handle: "ravi" }).tag)
  assert.equal(like(maan).renotify, false)
  assert.notEqual(like(maan).tag, notificationPush({ kind: "like", actor: maan, recipientHandle: "asha", postId: "p2", postVisible: true }).tag)
  assert.equal(messagePush(message()).tag, messagePush(message({ preview: "another" })).tag)
  assert.notEqual(messagePush(message()).tag, messagePush(message({ conversationId: "c2" })).tag)
  assert.equal(messagePush(message()).renotify, true)
})

test("each event has one key, so it is pushed once", () => {
  assert.equal(pushEventKey("like", "u-maan", "p1"), pushEventKey("like", "u-maan", "p1"))
  assert.notEqual(pushEventKey("like", "u-maan", "p1"), pushEventKey("repost", "u-maan", "p1"))
  assert.notEqual(pushEventKey("follow", "u-maan", null), pushEventKey("follow", "u-ravi", null))
})

test("a message push names the sender and carries no message text by default", () => {
  const push = messagePush(message())
  assert.equal(push.title, "Maan")
  assert.equal(push.body, "sent you a message")
  assert.equal(push.url, "/messages/c1")
  assert.ok(!JSON.stringify(push).includes(SECRET))
})

test("with previews on, a message push shows the message's first words", () => {
  const push = messagePush(message({ previewsOn: true }))
  assert.equal(push.title, "Maan")
  assert.equal(push.body, SECRET)
  // Nothing to show falls back to the plain line.
  assert.equal(messagePush(message({ previewsOn: true, preview: "  " })).body, "sent you a message")
})

test("a message request never shows the message, even with previews on", () => {
  const push = messagePush(message({ request: true, previewsOn: true }))
  assert.equal(push.body, "sent you a message request")
  assert.ok(!JSON.stringify(push).includes(SECRET))
})

test("a mention says so in place of the generic line, and its words appear only with previews on", () => {
  const plain = messagePush(message({ isGroup: true, groupTitle: "Weekend", mention: true }))
  assert.equal(plain.body, "Mentioned you")
  assert.ok(!JSON.stringify(plain).includes(SECRET))
  assert.equal(messagePush(message({ mention: true, previewsOn: true, preview: "see you at 5" })).body, "Mentioned you: see you at 5")
  assert.equal(messagePush(message({ mention: true, previewsOn: true, preview: "  " })).body, "Mentioned you")
})

test("a request is never a mention in the push, so it says what the request says", () => {
  assert.equal(messagePush(message({ mention: true, request: true, previewsOn: true })).body, messagePush(message({ request: true, previewsOn: true })).body)
})

test("a group message names the group", () => {
  assert.equal(messagePush(message({ isGroup: true, groupTitle: "Weekend" })).title, "Maan in Weekend")
  assert.equal(messagePush(message({ isGroup: true, groupTitle: "Weekend" })).body, "sent a message")
  assert.equal(messagePush(message({ isGroup: true })).title, "Maan")
})

const allowed = { self: false, kindOn: true, blocked: false, muted: false }

test("an event notifies when nothing stops it", () => {
  assert.equal(mayNotify(allowed), true)
  assert.equal(mayNotify({ ...allowed, conversationMuted: false }), true)
})

test("a kind switched off in settings does not notify", () => {
  assert.equal(mayNotify({ ...allowed, kindOn: false }), false)
})

test("a muted account or a muted conversation does not notify", () => {
  assert.equal(mayNotify({ ...allowed, muted: true }), false)
  assert.equal(mayNotify({ ...allowed, conversationMuted: true }), false)
})

test("a block either way does not notify", () => {
  assert.equal(mayNotify({ ...allowed, blocked: true }), false)
})

test("nobody is notified of their own action", () => {
  assert.equal(mayNotify({ ...allowed, self: true }), false)
})

// Shaped like VAPID keys (65 and 32 bytes of base64url), but not a real key pair.
const PUBLIC_KEY = "B" + "A".repeat(86)
const PRIVATE_KEY = "A".repeat(43)

test("push stays off unless all three VAPID settings are present and well formed", () => {
  const env = { RHENKO_VAPID_PUBLIC_KEY: PUBLIC_KEY, RHENKO_VAPID_PRIVATE_KEY: PRIVATE_KEY, RHENKO_VAPID_SUBJECT: "mailto:ops@example.com" }
  assert.deepEqual(vapidConfig(env), { publicKey: PUBLIC_KEY, privateKey: PRIVATE_KEY, subject: "mailto:ops@example.com" })
  assert.ok(vapidConfig({ ...env, RHENKO_VAPID_SUBJECT: "https://rhenko.example.com" }))
  assert.equal(vapidConfig({}), null)
  assert.equal(vapidConfig({ ...env, RHENKO_VAPID_PRIVATE_KEY: "" }), null)
  assert.equal(vapidConfig({ ...env, RHENKO_VAPID_PUBLIC_KEY: "not-a-key" }), null)
  assert.equal(vapidConfig({ ...env, RHENKO_VAPID_SUBJECT: "ops@example.com" }), null)
  assert.equal(vapidConfig({ ...env, RHENKO_VAPID_SUBJECT: "http://rhenko.example.com" }), null)
})

const subscription = (endpoint) => ({ endpoint, expirationTime: null, keys: { p256dh: PUBLIC_KEY, auth: "A".repeat(22) } })

test("subscriptions from the browsers' push services are accepted", () => {
  for (const endpoint of [
    "https://fcm.googleapis.com/fcm/send/abc",
    "https://updates.push.services.mozilla.com/wpush/v2/abc",
    "https://web.push.apple.com/abc",
    "https://wns2-par02p.notify.windows.com/w/?token=abc",
  ]) {
    assert.equal(checkPushSubscription(subscription(endpoint)).ok, true, endpoint)
  }
})

test("any other endpoint is refused, so the server never posts to an address someone chose", () => {
  for (const endpoint of [
    "http://fcm.googleapis.com/fcm/send/abc",
    "https://fcm.googleapis.com:8443/fcm/send/abc",
    "https://user:pass@fcm.googleapis.com/fcm/send/abc",
    "https://fcm.googleapis.com.evil.example/abc",
    "https://evilfcm.googleapis.com.example/abc",
    "https://127.0.0.1/abc",
    "https://localhost/abc",
    "not a url",
  ]) {
    assert.equal(checkPushSubscription(subscription(endpoint)).ok, false, endpoint)
  }
})

test("a subscription with missing or malformed keys is refused", () => {
  const good = subscription("https://fcm.googleapis.com/fcm/send/abc")
  assert.equal(checkPushSubscription(null).ok, false)
  assert.equal(checkPushSubscription({ endpoint: good.endpoint }).ok, false)
  assert.equal(checkPushSubscription({ ...good, keys: { ...good.keys, auth: "short" } }).ok, false)
  assert.equal(checkPushSubscription({ ...good, keys: { ...good.keys, p256dh: "A".repeat(87) } }).ok, false)
})

test("a ringing call is pushed with who is calling, what kind of call, and one tag per conversation", () => {
  const dm = callPush({ conversationId: "c1", callerName: "Asha", group: null, video: true })
  assert.equal(dm.title, "Asha")
  assert.equal(dm.body, "Incoming video call")
  assert.equal(dm.tag, "call:c1")
  assert.equal(dm.url, "/messages/c1")
  const group = callPush({ conversationId: "c2", callerName: "Asha", group: "Family", video: false })
  assert.equal(group.title, "Asha in Family")
  assert.equal(group.body, "Incoming group call")
  const unnamed = callPush({ conversationId: "c3", callerName: "Asha", group: "", video: false })
  assert.equal(unnamed.title, "Asha")
  assert.equal(unnamed.body, "Incoming group call")
})

test("being added to a group is pushed as an add, or an invite that needs accepting", () => {
  const added = groupAddPush({ conversationId: "g1", adderName: "Ravi", group: "Hiking", requested: false })
  assert.equal(added.title, "Ravi")
  assert.equal(added.body, "Added you to Hiking")
  assert.equal(added.url, "/messages/g1")
  const invited = groupAddPush({ conversationId: "g1", adderName: "Ravi", group: "", requested: true })
  assert.equal(invited.body, "Invited you to a group chat")
  assert.equal(invited.tag, "group:g1")
})
