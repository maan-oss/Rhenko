"use server"

import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { currentSessionHash, getAgreedViewer, newId } from "@/lib/auth"
import { change, get, run, transaction } from "@/lib/db"
import { describeAgent } from "@/lib/format"
import { checkPushSubscription, MAX_PUSH_DEVICES, PUSH_NOT_SET_UP, type PushSubscriptionFields } from "@/lib/notify-rules"
import { pushReady } from "@/lib/push"
import { consume, waitLabel } from "@/lib/rate-limit"

// Push on this device, off on it, the device list and message previews, from Settings → Notifications. Each device is
// tied to the sign-in that turned push on, so signing out of a browser stops its pushes. The browser's PushSubscription
// (its toJSON()) is checked before anything is kept.

type VoidResult = { ok: true } | { ok: false; error: string }

const HOUR_MS = 60 * 60 * 1000
const MAX_ID = 100

function refresh() {
  revalidatePath("/settings/notifications")
}

async function deviceLabel(): Promise<string> {
  return describeAgent(((await headers()).get("user-agent") ?? "").slice(0, 200))
}

// The signed-in account and the sign-in this request carries.
async function signedIn(): Promise<{ userId: string; session: string } | null> {
  const viewer = await getAgreedViewer()
  const session = viewer ? await currentSessionHash() : null
  return viewer && session ? { userId: viewer.id, session } : null
}

// Turns push on for this browser. A sign-in keeps one subscription, so a new one replaces the one it had.
export async function turnOnPush(subscription: unknown): Promise<VoidResult> {
  const me = await signedIn()
  if (!me) return { ok: false, error: "Sign in first." }
  if (!pushReady()) return { ok: false, error: PUSH_NOT_SET_UP }
  const checked = checkPushSubscription(subscription)
  if (!checked.ok) return checked
  const limit = await consume(`push-on:${me.userId}`, 20, HOUR_MS)
  if (!limit.ok) return { ok: false, error: `You've turned push on a lot. Try again in ${waitLabel(limit.retryAfterSeconds)}.` }
  const { endpoint, p256dh, auth } = checked.value
  const device = await deviceLabel()
  const now = Date.now()
  const result = await transaction(async (): Promise<VoidResult> => {
    // A device already in the list, or the one this sign-in is replacing, doesn't count toward the limit.
    const others = await get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ? AND endpoint <> ? AND session_hash IS DISTINCT FROM ?",
      me.userId,
      endpoint,
      me.session
    )
    if ((others?.n ?? 0) >= MAX_PUSH_DEVICES) return { ok: false, error: `Push can be on for up to ${MAX_PUSH_DEVICES} devices. Remove one to add this one.` }
    await run("DELETE FROM push_subscriptions WHERE session_hash = ? AND endpoint <> ?", me.session, endpoint)
    await run(
      `INSERT INTO push_subscriptions (id, user_id, session_hash, endpoint, p256dh, auth, device, created_at, last_seen)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, endpoint) DO UPDATE SET session_hash = excluded.session_hash, p256dh = excluded.p256dh,
         auth = excluded.auth, device = excluded.device, last_seen = excluded.last_seen`,
      newId(),
      me.userId,
      me.session,
      endpoint,
      p256dh,
      auth,
      device,
      now,
      now
    )
    return { ok: true }
  })
  if (result.ok) refresh()
  return result
}

// Each time the app opens with push allowed, the browser checks in with its subscription. That keeps the device's last
// activity current, picks up a subscription the browser replaced, and resumes push for an account that signed in here
// again. It never turns push on where it was off.
export async function checkInPush(subscription: unknown): Promise<{ on: boolean }> {
  const me = await signedIn()
  if (!me || !pushReady()) return { on: false }
  const checked = checkPushSubscription(subscription)
  if (!checked.ok) return { on: false }
  if (!(await consume(`push-check:${me.userId}`, 120, HOUR_MS)).ok) return { on: false }
  return await transaction(async () => resume(me.userId, me.session, checked.value, await deviceLabel(), Date.now()))
}

async function resume(userId: string, session: string, fields: PushSubscriptionFields, device: string, now: number): Promise<{ on: boolean }> {
  const known = await get<{ id: string }>("SELECT id FROM push_subscriptions WHERE user_id = ? AND endpoint = ?", userId, fields.endpoint)
  if (known) {
    await run("DELETE FROM push_subscriptions WHERE session_hash = ? AND id <> ?", session, known.id)
    await run(
      "UPDATE push_subscriptions SET session_hash = ?, p256dh = ?, auth = ?, device = ?, last_seen = ? WHERE id = ?",
      session,
      fields.p256dh,
      fields.auth,
      device,
      now,
      known.id
    )
    return { on: true }
  }
  // The browser replaced its subscription since this sign-in turned push on.
  const moved = await change(
    "UPDATE push_subscriptions SET endpoint = ?, p256dh = ?, auth = ?, device = ?, last_seen = ? WHERE session_hash = ? AND user_id = ?",
    fields.endpoint,
    fields.p256dh,
    fields.auth,
    device,
    now,
    session,
    userId
  )
  return { on: moved > 0 }
}

// Turns push off for this browser. `endpoint` is the browser's own subscription, when it has one. The answer says
// whether another account signed in on this browser still uses that subscription, in which case the browser keeps it.
export async function turnOffPush(endpoint: unknown): Promise<{ ok: true; shared: boolean } | { ok: false; error: string }> {
  const me = await signedIn()
  if (!me) return { ok: false, error: "Sign in first." }
  const own = typeof endpoint === "string" && endpoint.length > 0 && endpoint.length <= 2048 ? endpoint : null
  await run("DELETE FROM push_subscriptions WHERE user_id = ? AND (session_hash = ? OR endpoint = ?)", me.userId, me.session, own)
  const shared = own !== null && await get("SELECT 1 AS found FROM push_subscriptions WHERE endpoint = ?", own) !== undefined
  refresh()
  return { ok: true, shared }
}

// Removes another device from the list. It gets no more pushes from this account.
export async function removePushDevice(id: unknown): Promise<VoidResult> {
  const me = await signedIn()
  if (!me) return { ok: false, error: "Sign in first." }
  if (typeof id !== "string" || id.length === 0 || id.length > MAX_ID) return { ok: false, error: "That device isn't in the list any more. Reload the page." }
  await run("DELETE FROM push_subscriptions WHERE id = ? AND user_id = ?", id, me.userId)
  refresh()
  return { ok: true }
}

// When on, a push for a message shows its first words. Off by default.
export async function setMessagePreviews(on: unknown): Promise<VoidResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  if (typeof on !== "boolean") return { ok: false, error: "That setting isn't available. Reload the page and try again." }
  await run("UPDATE users SET push_previews = ? WHERE id = ?", on ? 1 : 0, viewer.id)
  refresh()
  return { ok: true }
}
