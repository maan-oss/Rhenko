// Rules for notifications and push: who an event may reach, what a push says, and what the server accepts as a push
// subscription. Pure functions, constants and types only, so tests/push.test.mjs can check them on their own.
import type { NotificationKind } from "@/lib/data"

// What each notification says after the name. The notifications page, the in-app banners and push all use it.
export const NOTICE: Record<NotificationKind, string> = {
  like: "liked your post",
  repost: "reposted your post",
  reply: "replied to you",
  quote: "quoted your post",
  follow: "followed you",
  mention: "mentioned you",
  follow_request: "asked to follow you",
  poll: "A poll you voted in has ended",
  post: "posted",
}

// The line a notification reads as in the daily digest email: who, then what. A poll result has no one to name, as in the
// notifications list.
export function noticeLine(kind: NotificationKind, actorName: string): string {
  return kind === "poll" ? NOTICE.poll : `${actorName} ${NOTICE[kind]}`
}

// What a push, and the digest, say after the sender's name for a message.
export function messageLine(isGroup: boolean, request: boolean): string {
  return request ? "sent you a message request" : isGroup ? "sent a message" : "sent you a message"
}

// What the settings page and the server actions say when the server has no VAPID keys.
export const PUSH_NOT_SET_UP = "Push is not set up on this server."

// How many devices one account can get push on.
export const MAX_PUSH_DEVICES = 20

// What decides whether an event reaches someone, in the app or by push.
export type DeliveryFacts = {
  // The person who acted is the person it would reach.
  self: boolean
  // The switch for this kind in Settings → Notifications. Messages have no switch there, so they pass true.
  kindOn: boolean
  // A block between the two accounts, either way.
  blocked: boolean
  // The person it would reach muted the account that acted.
  muted: boolean
  // For a message: the person it would reach muted the conversation.
  conversationMuted?: boolean
}

// The callers check their own rules first: a mention from an unverified account when only verified ones may notify, and a
// new post from an account the subscriber no longer follows, never get this far.
export function mayNotify(facts: DeliveryFacts): boolean {
  return !facts.self && facts.kindOn && !facts.blocked && !facts.muted && facts.conversationMuted !== true
}

// What the service worker shows. The tag makes a later push for the same post or conversation replace the earlier one.
export type PushPayload = {
  title: string
  body: string
  tag: string
  // A path on this site. The service worker opens nothing else.
  url: string
  // Whether a push that replaces another alerts again. Messages do; another like on the same post updates quietly.
  renotify: boolean
}

export type NotificationPushInput = {
  kind: NotificationKind
  actor: { id: string; name: string; handle: string }
  recipientHandle: string
  postId: string | null
  // Whether the recipient may open that post. A post hidden from them is never linked: the push opens the profile.
  postVisible: boolean
}

// A push for a notification says who and what happened, never what a post says.
export function notificationPush(input: NotificationPushInput): PushPayload {
  return {
    title: input.actor.name,
    body: NOTICE[input.kind],
    tag: `${input.kind}:${input.postId ?? input.actor.id}`,
    url: notificationUrl(input),
    renotify: input.kind !== "like" && input.kind !== "repost",
  }
}

// The same page a row on the notifications page opens. Likes and reposts are of your own post; replies, quotes,
// mentions, new posts and poll results point at the other person's.
export function notificationUrl(input: NotificationPushInput): string {
  if (input.kind === "follow_request") return "/notifications"
  const own = input.kind === "like" || input.kind === "repost"
  if (input.postId && input.postVisible && input.kind !== "follow") {
    return `/${encodeURIComponent(own ? input.recipientHandle : input.actor.handle)}/status/${encodeURIComponent(input.postId)}`
  }
  return `/${encodeURIComponent(input.actor.handle)}`
}

export type MessagePushInput = {
  conversationId: string
  senderName: string
  isGroup: boolean
  // The group's name. Empty for a one-to-one chat or a group nobody named.
  groupTitle: string
  // The recipient hasn't accepted the conversation yet.
  request: boolean
  // The message names the recipient with @handle. Says so in place of the generic line.
  mention: boolean
  // What the conversation list shows for the message: its first words, or "Sent a photo". Used only with previews on.
  preview: string
  previewsOn: boolean
}

// A push for a message names the sender and says a message came. Its words appear only when the recipient turned on
// "Show message previews", and never for a request from someone they haven't accepted.
export function messagePush(input: MessagePushInput): PushPayload {
  const line = messageLine(input.isGroup, input.request)
  const preview = input.previewsOn && !input.request ? input.preview.trim() : ""
  const mentioned = input.mention && !input.request
  return {
    title: input.isGroup && input.groupTitle ? `${input.senderName} in ${input.groupTitle}` : input.senderName,
    body: mentioned ? (preview ? `Mentioned you: ${preview}` : "Mentioned you") : preview || line,
    tag: `message:${input.conversationId}`,
    url: `/messages/${encodeURIComponent(input.conversationId)}`,
    renotify: true,
  }
}

export type ReminderPushInput = {
  conversationId: string
  messageId: string
  // The person who sent the message.
  senderName: string
  // What the message says, or what it was instead ("Sent a photo"). Used only with previews on.
  preview: string
  previewsOn: boolean
}

// A push for a reminder the person asked for. It names the sender, and the message's words only when previews are on.
export function reminderPush(input: ReminderPushInput): PushPayload {
  const preview = input.previewsOn ? input.preview.trim() : ""
  return {
    title: "Reminder",
    body: preview ? `${input.senderName}: ${preview}` : `A message from ${input.senderName}`,
    tag: `reminder:${input.messageId}`,
    url: `/messages/${encodeURIComponent(input.conversationId)}?m=${encodeURIComponent(input.messageId)}`,
    renotify: true,
  }
}

export type CallPushInput = {
  conversationId: string
  callerName: string
  // The group's name, empty for a group nobody named. Null for a one-to-one call.
  group: string | null
  video: boolean
}

// A push for a call that is ringing, to someone whose app is closed. The next ring in the same conversation replaces it.
export function callPush(input: CallPushInput): PushPayload {
  const body = input.group !== null ? "Incoming group call" : input.video ? "Incoming video call" : "Incoming voice call"
  return {
    title: input.group ? `${input.callerName} in ${input.group}` : input.callerName,
    body,
    tag: `call:${input.conversationId}`,
    url: `/messages/${encodeURIComponent(input.conversationId)}`,
    renotify: true,
  }
}

export type GroupAddPushInput = {
  conversationId: string
  adderName: string
  group: string
  // The person was invited from outside their follows, so they accept before the group is theirs.
  requested: boolean
}

// A push for being added to a group. The group opens from its page, where an invite is accepted.
export function groupAddPush(input: GroupAddPushInput): PushPayload {
  const place = input.group.trim() || "a group chat"
  return {
    title: input.adderName,
    body: input.requested ? `Invited you to ${place}` : `Added you to ${place}`,
    tag: `group:${input.conversationId}`,
    url: `/messages/${encodeURIComponent(input.conversationId)}`,
    renotify: true,
  }
}

// One push per event. A like taken back and given again, or a poll announced again after a crash, has the same key.
export function pushEventKey(kind: NotificationKind, actorId: string, postId: string | null): string {
  return `${kind}:${actorId}:${postId ?? ""}`
}

// Base64url text of exactly `bytes` bytes, with or without padding.
function isBase64Url(value: string, bytes: number): boolean {
  const bare = value.replace(/=+$/, "")
  return /^[A-Za-z0-9_-]+$/.test(bare) && bare.length === Math.ceil((bytes * 4) / 3)
}

// An uncompressed P-256 public key: 65 bytes starting with 0x04, which is "B" in base64url.
function isP256PublicKey(value: string): boolean {
  return isBase64Url(value, 65) && value.startsWith("B")
}

export type VapidConfig = { publicKey: string; privateKey: string; subject: string }

// The server's VAPID keys, or null when any of the three is missing or malformed. Push is then off everywhere.
export function vapidConfig(env: Record<string, string | undefined>): VapidConfig | null {
  const publicKey = env.RHENKO_VAPID_PUBLIC_KEY?.trim() ?? ""
  const privateKey = env.RHENKO_VAPID_PRIVATE_KEY?.trim() ?? ""
  const subject = env.RHENKO_VAPID_SUBJECT?.trim() ?? ""
  if (!isP256PublicKey(publicKey) || !isBase64Url(privateKey, 32)) return null
  if (!/^mailto:[^\s@]+@[^\s@]+$/.test(subject) && !/^https:\/\/[^\s/]+\S*$/.test(subject)) return null
  return { publicKey, privateKey, subject }
}

// The push services of the browsers people use: Google (Chrome, Android and most Chromium browsers), Mozilla (Firefox),
// Apple (Safari) and Microsoft (Edge on Windows). The server posts to the endpoint a browser hands it, so any other host
// is refused: otherwise a crafted subscription could make the server send requests to an address of someone's choosing.
const PUSH_SERVICE_HOSTS = ["fcm.googleapis.com", "push.services.mozilla.com", "push.apple.com", "notify.windows.com"]
const MAX_ENDPOINT = 2048

export type PushSubscriptionFields = { endpoint: string; p256dh: string; auth: string }

// The parts of a browser's PushSubscription (its toJSON()) the server keeps, after checking them.
export function checkPushSubscription(input: unknown): { ok: true; value: PushSubscriptionFields } | { ok: false; error: string } {
  const invalid = { ok: false as const, error: "This browser sent a push subscription the server can't use. Turn push off and on again." }
  if (typeof input !== "object" || input === null) return invalid
  const { endpoint, keys } = input as { endpoint?: unknown; keys?: unknown }
  if (typeof endpoint !== "string" || endpoint.length > MAX_ENDPOINT || typeof keys !== "object" || keys === null) return invalid
  const { p256dh, auth } = keys as { p256dh?: unknown; auth?: unknown }
  if (typeof p256dh !== "string" || !isP256PublicKey(p256dh) || typeof auth !== "string" || !isBase64Url(auth, 16)) return invalid
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return invalid
  }
  const host = url.hostname.toLowerCase()
  const known = PUSH_SERVICE_HOSTS.some((service) => host === service || host.endsWith(`.${service}`))
  if (url.protocol !== "https:" || url.port !== "" || url.username !== "" || url.password !== "" || !known) {
    return { ok: false, error: "This browser's push service isn't supported." }
  }
  return { ok: true, value: { endpoint, p256dh, auth } }
}

// A device in Settings → Notifications. The endpoint and keys stay on the server.
export type PushDeviceView = {
  id: string
  // A short label from the browser, like "Chrome on Android".
  device: string
  createdAt: number
  lastSeen: number
  // False once the account signed out there. Push to it pauses until the account signs in on it again.
  signedIn: boolean
  // The sign-in this page was loaded with.
  current: boolean
}
