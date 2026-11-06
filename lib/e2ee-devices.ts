// Devices that hold the keys to read encrypted messages: linking one, listing them, removing one, and finding the devices a
// message must be sent to. The rules a device must meet are in lib/e2ee-rules.ts; the message encryption is in lib/e2ee.ts.

import { cookies } from "next/headers"
import { newId } from "@/lib/auth"
import { all, change, get, run, transaction } from "@/lib/db"
import { MAX_DEVICES_PER_USER, checkDeviceRegistration, type DeviceRegistrationInput } from "@/lib/e2ee-rules"

// The browser remembers its device for each account signed in to it, in an httpOnly cookie: a JSON map from account id to
// device id. The keys themselves stay on the device. One browser can hold several accounts, and each has its own device.
export const DEVICE_COOKIE = "rhenko_device"
const DEVICE_COOKIE_MS = 365 * 24 * 60 * 60 * 1000
const MAX_REMEMBERED_ACCOUNTS = 16
const MAX_ID_CHARS = 128

export function deviceCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DEVICE_COOKIE_MS / 1000,
  }
}

export type DeviceRow = {
  id: string
  user_id: string
  agreement_key: string
  signing_key: string
  label: string
  created_at: number | string
}

export type MemberDevice = { id: string; user_id: string; agreement_key: string; signing_key: string }

export type MemberDevices = { devices: MemberDevice[]; memberWithoutDevice: boolean }

// A device that may have written a message in a conversation: its id and signing key, whether or not it is still linked.
export type KnownDevice = { id: string; signing_key: string }

export type RegisterResult = { ok: true; id: string } | { ok: false; error: string }

function parseDeviceMap(value: string | undefined): Record<string, string> {
  if (!value) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    return {}
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
  const map: Record<string, string> = {}
  for (const [account, device] of Object.entries(parsed)) {
    if (typeof device === "string" && account.length <= MAX_ID_CHARS && device.length <= MAX_ID_CHARS) map[account] = device
  }
  return map
}

async function deviceMap(): Promise<Record<string, string>> {
  return parseDeviceMap((await cookies()).get(DEVICE_COOKIE)?.value)
}

// The device this browser has for an account, whether or not it is still linked.
export async function deviceCookieFor(userId: string): Promise<string | null> {
  return (await deviceMap())[userId] ?? null
}

// Remembers the device this browser uses for an account. The newest accounts are kept when there are too many.
export async function rememberDeviceFor(userId: string, deviceId: string): Promise<void> {
  const map = await deviceMap()
  delete map[userId]
  map[userId] = deviceId
  const entries = Object.entries(map).slice(-MAX_REMEMBERED_ACCOUNTS)
  const store = await cookies()
  store.set(DEVICE_COOKIE, JSON.stringify(Object.fromEntries(entries)), deviceCookieOptions())
}

// Forgets the device this browser used for an account.
export async function forgetDeviceFor(userId: string): Promise<void> {
  const map = await deviceMap()
  if (!(userId in map)) return
  delete map[userId]
  const store = await cookies()
  if (Object.keys(map).length === 0) store.delete(DEVICE_COOKIE)
  else store.set(DEVICE_COOKIE, JSON.stringify(map), deviceCookieOptions())
}

export async function activeDevicesOf(userId: string): Promise<DeviceRow[]> {
  return await all<DeviceRow>(
    "SELECT id, user_id, agreement_key, signing_key, label, created_at FROM e2ee_devices WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at ASC, id ASC",
    userId
  )
}

export async function activeDeviceOf(userId: string, deviceId: string): Promise<DeviceRow | undefined> {
  return await get<DeviceRow>(
    "SELECT id, user_id, agreement_key, signing_key, label, created_at FROM e2ee_devices WHERE id = ? AND user_id = ? AND revoked_at IS NULL",
    deviceId,
    userId
  )
}

// The device this browser is for the viewer, when it is still linked to their account.
export async function thisDeviceOf(userId: string): Promise<DeviceRow | undefined> {
  const id = await deviceCookieFor(userId)
  if (!id) return undefined
  return await activeDeviceOf(userId, id)
}

// Links a device for the user. The browser's previous device for this account, if it has one, is replaced: a browser that has
// lost its keys sets up again, and the old device must not stay able to read new messages. Refused when the account is at its
// limit. The caller remembers the new device in the browser (see setUpThisDevice).
export async function registerDevice(userId: string, input: DeviceRegistrationInput): Promise<RegisterResult> {
  const check = await checkDeviceRegistration(input)
  if (!check.ok) return check
  const previous = await deviceCookieFor(userId)
  const id = newId()
  return await transaction(async (): Promise<RegisterResult> => {
    // Serialises registrations for one account, so two at once cannot both pass the limit.
    await get("SELECT id FROM users WHERE id = ? FOR UPDATE", userId)
    const counted = await get<{ c: number | string }>(
      "SELECT COUNT(*) AS c FROM e2ee_devices WHERE user_id = ? AND revoked_at IS NULL AND id <> ?",
      userId,
      previous ?? ""
    )
    if (Number(counted?.c ?? 0) >= MAX_DEVICES_PER_USER) {
      return { ok: false, error: `You can link up to ${MAX_DEVICES_PER_USER} devices. Remove one first.` }
    }
    if (previous) {
      await run("UPDATE e2ee_devices SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL", Date.now(), previous, userId)
    }
    await run(
      "INSERT INTO e2ee_devices (id, user_id, agreement_key, signing_key, label, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      id,
      userId,
      check.value.agreement,
      check.value.signing,
      check.value.label,
      Date.now()
    )
    return { ok: true, id }
  })
}

// Removes a device so it can no longer read messages sent after this. Returns false when the device is not the user's.
export async function revokeDevice(userId: string, deviceId: string): Promise<boolean> {
  const changed = await change(
    "UPDATE e2ee_devices SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL",
    Date.now(),
    deviceId,
    userId
  )
  return changed > 0
}

// Every active device of the people who are in a conversation, and whether some member has no device at all. A person with a
// pending request is included: a request's messages are readable to them on the same terms as a plain request, so they get a copy.
// A message cannot be sent while a member has no device, because they could not read it.
export async function memberDevicesOf(conversationId: string): Promise<MemberDevices> {
  const devices = await all<MemberDevice>(
    `SELECT d.id, d.user_id, d.agreement_key, d.signing_key
       FROM e2ee_devices d
       JOIN conversation_members m ON m.user_id = d.user_id
       JOIN users u ON u.id = d.user_id
      WHERE m.conversation_id = ? AND m.status IN ('accepted', 'requested') AND u.deactivated_at IS NULL AND d.revoked_at IS NULL
      ORDER BY d.user_id ASC, d.created_at ASC, d.id ASC`,
    conversationId
  )
  const members = await all<{ user_id: string; has_device: number | string }>(
    `SELECT m.user_id,
            CASE WHEN EXISTS (SELECT 1 FROM e2ee_devices d WHERE d.user_id = m.user_id AND d.revoked_at IS NULL) THEN 1 ELSE 0 END AS has_device
       FROM conversation_members m
       JOIN users u ON u.id = m.user_id
      WHERE m.conversation_id = ? AND m.status IN ('accepted', 'requested') AND u.deactivated_at IS NULL`,
    conversationId
  )
  const memberWithoutDevice = members.some((member) => !Number(member.has_device))
  return { devices, memberWithoutDevice }
}

// Signing out ends this browser's device for the account: the device is unlinked, so it gets no further messages, and the
// browser forgets it. The browser clears the keys it holds for that device too (see lib/e2ee-keystore.ts).
export async function unlinkBrowserDevice(userId: string): Promise<void> {
  const id = await deviceCookieFor(userId)
  if (id) await revokeDevice(userId, id)
  await forgetDeviceFor(userId)
}

// Every device of anyone who has ever been in a conversation, linked or removed. A removed device still signed the messages it
// wrote, so those messages can still be checked against it.
export async function knownDevicesOf(conversationId: string): Promise<KnownDevice[]> {
  return await all<KnownDevice>(
    `SELECT d.id, d.signing_key FROM e2ee_devices d
      WHERE d.user_id IN (SELECT user_id FROM conversation_members WHERE conversation_id = ?)
      ORDER BY d.created_at ASC, d.id ASC`,
    conversationId
  )
}
