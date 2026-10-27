import { createHash } from "node:crypto"
import { sendNotification, type Urgency } from "web-push"
import { all, change, get, outsideTransaction, run } from "@/lib/db"
import { canSeePost, type NotificationKind } from "@/lib/data"
import { callPush, groupAddPush, mayNotify, messagePush, notificationPush, pushEventKey, vapidConfig, type CallPushInput, type GroupAddPushInput, type PushDeviceView, type PushPayload } from "@/lib/notify-rules"

// Web Push. When something notifies a person, each device they turned push on for gets a short encrypted message through
// its browser's push service, and the service worker (public/sw.js) shows it, even with Rhenko closed. Nothing is sent
// unless the server has VAPID keys: RHENKO_VAPID_PUBLIC_KEY, RHENKO_VAPID_PRIVATE_KEY and RHENKO_VAPID_SUBJECT.

// A push waits at the push service this long for a device that is offline. An alert a day old is not worth showing.
const TTL_SECONDS = 24 * 60 * 60
// A ring is only worth showing while it could still be answered. Past this, the phone shows nothing for it.
const CALL_RING_TTL_SECONDS = 60
const SEND_TIMEOUT_MS = 10_000
// Pushes go out in the background, a few people at a time, so a poll with thousands of voters can't open thousands of
// connections at once. Beyond MAX_WAITING the newest are dropped and logged.
const MAX_SENDING = 4
const MAX_WAITING = 10_000
const DAY_MS = 24 * 60 * 60 * 1000
// How long a pushed event is remembered, so it is not pushed again.
const PUSHED_KEEP_MS = 30 * DAY_MS
// A device whose account signed out of it is removed after this long.
const SIGNED_OUT_KEEP_MS = 90 * DAY_MS

export function pushReady(): boolean {
  return vapidConfig(process.env) !== null
}

// The key browsers subscribe with. Null when push is not set up.
export function vapidPublicKey(): string | null {
  return vapidConfig(process.env)?.publicKey ?? null
}

type Device = { endpoint: string; p256dh: string; auth: string }

// The devices that get a person's pushes: those where the account is still signed in.
async function devicesOf(userId: string): Promise<Device[]> {
  return await all<Device>(
    `SELECT p.endpoint, p.p256dh, p.auth FROM push_subscriptions p
     JOIN sessions s ON s.token_hash = p.session_hash AND s.expires_at > ?
     JOIN users u ON u.id = p.user_id AND u.deactivated_at IS NULL
     WHERE p.user_id = ?`,
    Date.now(),
    userId
  )
}

// A push for a notification. notify() calls it after writing the notification, so every rule that stops a notification
// (its switch, a block, a mute, a mention filter, an alert from an account no longer followed) stops the push too.
export async function pushNotification(recipientId: string, actorId: string, kind: NotificationKind, postId: string | null): Promise<void> {
  if (!pushReady()) return
  const devices = await devicesOf(recipientId)
  if (devices.length === 0) return
  const fresh = await change(
    "INSERT INTO pushed_events (user_id, event_key, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING",
    recipientId,
    pushEventKey(kind, actorId, postId),
    Date.now()
  )
  if (fresh === 0) return
  const people = await all<{ id: string; name: string; handle: string }>("SELECT id, name, handle FROM users WHERE id IN (?, ?)", actorId, recipientId)
  const actor = people.find((person) => person.id === actorId)
  const recipient = people.find((person) => person.id === recipientId)
  if (!actor || !recipient) return
  const postVisible = postId !== null && await canSeePost(postId, recipientId)
  enqueue(devices, notificationPush({ kind, actor, recipientHandle: recipient.handle, postId, postVisible }), "normal")
}

// A push for a new message to each other member with push on. A muted conversation, a block either way, or a muted
// sender gets none, except that a member the message mentions gets one even when the conversation is muted. The message
// itself is never stored for this: its preview goes into the encrypted push only.
export async function pushMessage(
  conversationId: string,
  sender: { id: string; name: string },
  conversation: { kind: "dm" | "group"; title: string },
  preview: string,
  mentioned: ReadonlySet<string> = new Set()
): Promise<void> {
  if (!pushReady()) return
  const members = await all<{ user_id: string; status: string; muted: number; previews: number; blocked: number; sender_muted: number }>(
    `SELECT m.user_id, m.status, m.muted, u.push_previews AS previews,
       EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = m.user_id AND b.blocked_id = ?1) OR (b.blocker_id = ?1 AND b.blocked_id = m.user_id)) AS blocked,
       EXISTS (SELECT 1 FROM mutes x WHERE x.muter_id = m.user_id AND x.muted_id = ?1) AS sender_muted
     FROM conversation_members m JOIN users u ON u.id = m.user_id
     WHERE m.conversation_id = ?2 AND m.user_id <> ?1 AND u.deactivated_at IS NULL
       AND EXISTS (SELECT 1 FROM push_subscriptions p WHERE p.user_id = m.user_id AND p.session_hash IS NOT NULL)`,
    sender.id,
    conversationId
  )
  for (const member of members) {
    const mention = mentioned.has(member.user_id)
    const facts = { self: false, kindOn: true, blocked: member.blocked === 1, muted: member.sender_muted === 1, conversationMuted: member.muted === 1 && !mention }
    if (!mayNotify(facts)) continue
    const devices = await devicesOf(member.user_id)
    if (devices.length === 0) continue
    const payload = messagePush({
      conversationId,
      senderName: sender.name,
      isGroup: conversation.kind === "group",
      groupTitle: conversation.title,
      request: member.status === "requested",
      mention,
      preview,
      previewsOn: member.previews === 1,
    })
    enqueue(devices, payload, "high")
  }
}

type Job = { devices: Device[]; payload: PushPayload; urgency: Urgency; ttl: number }
const waiting: Job[] = []
let sending = 0

function enqueue(devices: Device[], payload: PushPayload, urgency: Urgency, ttl: number = TTL_SECONDS): void {
  if (waiting.length >= MAX_WAITING) {
    console.error("[push] too many pushes waiting; one was dropped")
    return
  }
  waiting.push({ devices, payload, urgency, ttl })
  pump()
}

function pump(): void {
  while (sending < MAX_SENDING && waiting.length > 0) {
    const job = waiting.shift() as Job
    sending++
    void outsideTransaction(() => deliver(job))
      .catch((error) => console.error("[push] sending failed", error))
      .finally(() => {
        sending--
        pump()
      })
  }
}

async function deliver(job: Job): Promise<void> {
  const vapidDetails = vapidConfig(process.env)
  if (!vapidDetails) return
  const body = JSON.stringify(job.payload)
  // A push service keeps only the newest waiting push of a topic for a device that is offline. The tag, hashed, is the
  // topic, so an offline phone gets the latest message of a conversation, not every one.
  const topic = createHash("sha256").update(job.payload.tag).digest("base64url").slice(0, 32)
  await Promise.all(
    job.devices.map(async (device) => {
      try {
        await sendNotification({ endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } }, body, {
          vapidDetails,
          TTL: job.ttl,
          urgency: job.urgency,
          topic,
          timeout: SEND_TIMEOUT_MS,
          contentEncoding: "aes128gcm",
        })
      } catch (error) {
        const status = (error as { statusCode?: unknown }).statusCode
        // The browser dropped this subscription, so every account on that browser loses it.
        if (status === 404 || status === 410) {
          await run("DELETE FROM push_subscriptions WHERE endpoint = ?", device.endpoint)
          return
        }
        // The endpoint identifies a device, so only its host is logged.
        console.error(`[push] ${hostOf(device.endpoint)} refused a push: ${typeof status === "number" ? `HTTP ${status}` : String(error)}`)
      }
    })
  )
}

function hostOf(endpoint: string): string {
  try {
    return new URL(endpoint).host
  } catch {
    return "unknown host"
  }
}

// A push for a call that is ringing. Its recipients are the people the call rings: in a one-to-one chat the other person,
// in a group the members whose app is closed, since the open ones already ring on screen.
export async function pushCallRing(conversationId: string, caller: { id: string; name: string }, group: string | null, video: boolean, recipientIds: string[]): Promise<void> {
  if (!pushReady()) return
  const input: CallPushInput = { conversationId, callerName: caller.name, group, video }
  const payload = callPush(input)
  for (const recipientId of recipientIds) {
    if (recipientId === caller.id) continue
    const devices = await devicesOf(recipientId)
    if (devices.length === 0) continue
    enqueue(devices, payload, "high", CALL_RING_TTL_SECONDS)
  }
}

// A push for being added to a group. A person who muted the one who added them gets none, as with any other push.
export async function pushGroupAdded(conversationId: string, adder: { id: string; name: string }, recipientId: string, group: string, requested: boolean): Promise<void> {
  if (!pushReady() || adder.id === recipientId) return
  if (await get("SELECT 1 AS found FROM mutes WHERE muter_id = ? AND muted_id = ?", recipientId, adder.id)) return
  const devices = await devicesOf(recipientId)
  if (devices.length === 0) return
  const input: GroupAddPushInput = { conversationId, adderName: adder.name, group, requested }
  enqueue(devices, groupAddPush(input), "high")
}

// The devices on the settings page, most recently active first.
export async function pushDevicesFor(userId: string, currentSession: string | null): Promise<PushDeviceView[]> {
  const rows = await all<{ id: string; device: string; created_at: number; last_seen: number; session_hash: string | null; signed_in: number }>(
    `SELECT p.id, p.device, p.created_at, p.last_seen, p.session_hash,
       EXISTS (SELECT 1 FROM sessions s WHERE s.token_hash = p.session_hash AND s.expires_at > ?) AS signed_in
     FROM push_subscriptions p WHERE p.user_id = ? ORDER BY p.last_seen DESC`,
    Date.now(),
    userId
  )
  return rows.map((row) => ({
    id: row.id,
    device: row.device || "Unknown device",
    createdAt: row.created_at,
    lastSeen: row.last_seen,
    signedIn: row.signed_in === 1,
    current: currentSession !== null && row.session_hash === currentSession,
  }))
}

export async function messagePreviewsOn(userId: string): Promise<boolean> {
  return (await get<{ push_previews: number }>("SELECT push_previews FROM users WHERE id = ?", userId))?.push_previews === 1
}

// Run by the maintenance tick. Remembered events and long signed-out devices are removed.
export async function prunePush(now: number): Promise<void> {
  await run("DELETE FROM pushed_events WHERE created_at < ?", now - PUSHED_KEEP_MS)
  await run("DELETE FROM push_subscriptions WHERE session_hash IS NULL AND last_seen < ?", now - SIGNED_OUT_KEEP_MS)
}
