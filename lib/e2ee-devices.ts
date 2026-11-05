// Devices that hold the keys to read encrypted messages: linking one, listing them, removing one, and finding the devices a
// message must be sent to. The rules a device must meet are in lib/e2ee-rules.ts; the message encryption is in lib/e2ee.ts.

import { cookies } from "next/headers"
import { newId } from "@/lib/auth"
import { all, change, get, run, transaction } from "@/lib/db"
import { MAX_DEVICES_PER_USER, checkDeviceRegistration, type DeviceRegistrationInput } from "@/lib/e2ee-rules"

// The browser remembers which device it is in an httpOnly cookie. The keys themselves stay on the device.
export const DEVICE_COOKIE = "rhenko_device"
const DEVICE_COOKIE_MS = 365 * 24 * 60 * 60 * 1000

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

export type RegisterResult = { ok: true; id: string } | { ok: false; error: string }

export async function deviceCookie(): Promise<string | null> {
  return (await cookies()).get(DEVICE_COOKIE)?.value ?? null
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

// The device this browser is, when it belongs to the viewer and has not been removed.
export async function thisDeviceOf(userId: string): Promise<DeviceRow | undefined> {
  const id = await deviceCookie()
  if (!id) return undefined
  return await activeDeviceOf(userId, id)
}

// Links a device for the user. The browser's previous device, if it has one, is replaced: a browser that has lost its keys
// sets up again, and the old device must not stay able to read new messages. Refused when the account is at its limit.
export async function registerDevice(userId: string, input: DeviceRegistrationInput): Promise<RegisterResult> {
  const check = await checkDeviceRegistration(input)
  if (!check.ok) return check
  const previous = await deviceCookie()
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

// Every active device of the people who are in a conversation (accepted members only, not pending requests), and whether
// some member has no device at all. A message cannot be sent while a member has no device, because they could not read it.
export async function memberDevicesOf(conversationId: string): Promise<MemberDevices> {
  const devices = await all<MemberDevice>(
    `SELECT d.id, d.user_id, d.agreement_key, d.signing_key
       FROM e2ee_devices d
       JOIN conversation_members m ON m.user_id = d.user_id
       JOIN users u ON u.id = d.user_id
      WHERE m.conversation_id = ? AND m.status = 'accepted' AND u.deactivated_at IS NULL AND d.revoked_at IS NULL
      ORDER BY d.user_id ASC, d.created_at ASC, d.id ASC`,
    conversationId
  )
  const members = await all<{ user_id: string; has_device: number | string }>(
    `SELECT m.user_id,
            CASE WHEN EXISTS (SELECT 1 FROM e2ee_devices d WHERE d.user_id = m.user_id AND d.revoked_at IS NULL) THEN 1 ELSE 0 END AS has_device
       FROM conversation_members m
       JOIN users u ON u.id = m.user_id
      WHERE m.conversation_id = ? AND m.status = 'accepted' AND u.deactivated_at IS NULL`,
    conversationId
  )
  const memberWithoutDevice = members.some((member) => !Number(member.has_device))
  return { devices, memberWithoutDevice }
}
