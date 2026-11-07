"use server"

import { getAgreedViewer } from "@/lib/auth"
import { all, get } from "@/lib/db"
import { safetyNumber } from "@/lib/e2ee"
import {
  activeDeviceOf,
  activeDevicesOf,
  deviceCookieFor,
  forgetDeviceFor,
  memberDevicesOf,
  registerDevice,
  rememberDeviceFor,
  revokeDevice,
  thisDeviceOf,
  type MemberDevice,
} from "@/lib/e2ee-devices"
import {
  approveLink,
  copyTargetOf,
  historyPageOf,
  linkStateOf,
  copyableLinksOf,
  pendingLinksOf,
  startLink,
  storeHistoryWraps,
  type CopyableLink,
  type HistoryRow,
  type LinkState,
  type PendingLink,
} from "@/lib/e2ee-link"
import { LINK_REQUIRED, historyCursorInput, historyWrapsInput, linkCodeInput } from "@/lib/e2ee-link-rules"
import { checkDeviceRegistration } from "@/lib/e2ee-rules"

// The device this browser is for the signed-in account. The browser keeps the private keys; the server only sees public halves.
export type ThisDevice = { id: string; label: string } | null

export type DeviceSetup = { ok: true; deviceId: string } | { ok: false; error: string }

export type LinkedDevice = { id: string; label: string; createdAt: number; current: boolean }

export type DeviceRemoval = { ok: true } | { ok: false; error: string }

export type LinkFailure = { ok: false; error: string }
export type LinkStarted = { ok: true; code: string; expiresAt: number } | LinkFailure
export type LinkStatus = { ok: true; state: LinkState } | LinkFailure
export type PendingLinks = { ok: true; links: PendingLink[] } | LinkFailure
export type LinkApproval = { ok: true; deviceId: string } | LinkFailure
export type CopyTarget = { ok: true; deviceId: string; agreement: string } | LinkFailure
export type HistoryPage = { ok: true; rows: HistoryRow[] } | LinkFailure
export type CopyResult = { ok: true; count: number } | LinkFailure

const NOT_SIGNED_IN = "Sign in to use encrypted messages."
const NOT_A_DEVICE = "Approve and copy from a device that is linked to your account."

export async function thisDevice(): Promise<ThisDevice> {
  const viewer = await getAgreedViewer()
  if (!viewer) return null
  const row = await thisDeviceOf(viewer.id)
  return row ? { id: row.id, label: row.label } : null
}

// Called by a browser after it creates its keys. Links the device to the account and remembers it in this browser. An account that
// already has devices is not joined this way: a new browser is linked from one of them (see startDeviceLink). A browser that is
// already one of the account's devices, and has lost its keys, sets up again in its place.
export async function setUpThisDevice(input: { agreement: string; signing: string; label: string }): Promise<DeviceSetup> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: NOT_SIGNED_IN }
  const current = await deviceCookieFor(viewer.id)
  const others = (await activeDevicesOf(viewer.id)).filter((device) => device.id !== current)
  if (others.length > 0) return { ok: false, error: LINK_REQUIRED }
  const result = await registerDevice(viewer.id, input)
  if (!result.ok) return result
  await rememberDeviceFor(viewer.id, result.id)
  return { ok: true, deviceId: result.id }
}

// A browser that is not linked asks to be linked from a device the account already has. It sends the public halves of its new keys,
// and shows the code it gets back. The private keys never leave the browser.
export async function startDeviceLink(input: { agreement: string; signing: string; label: string }): Promise<LinkStarted> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: NOT_SIGNED_IN }
  const check = await checkDeviceRegistration(input)
  if (!check.ok) return check
  if ((await activeDevicesOf(viewer.id)).length === 0) {
    return { ok: false, error: "This account has no linked device yet. Set up this browser instead." }
  }
  return startLink(viewer.id, check.value)
}

// How a link this browser asked for is going. Once it is approved, this browser is remembered as the device the link made.
export async function deviceLinkStatus(code: string): Promise<LinkStatus> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: NOT_SIGNED_IN }
  const checked = linkCodeInput(code)
  if (!checked.ok) return checked
  const state = await linkStateOf(viewer.id, checked.code)
  if (state.status === "approved") await rememberDeviceFor(viewer.id, state.deviceId)
  return { ok: true, state }
}

// The links waiting for approval on this account. Only a device the account already has is told of them.
export async function pendingDeviceLinks(): Promise<PendingLinks> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: NOT_SIGNED_IN }
  if (!(await approverOf(viewer.id))) return { ok: true, links: [] }
  return { ok: true, links: await pendingLinksOf(viewer.id) }
}

// The approved links whose history this device can still copy, for a copy that failed part way to be run again.
export type CopyableLinks = { ok: true; links: CopyableLink[] } | LinkFailure
export async function copyableDeviceLinks(): Promise<CopyableLinks> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: NOT_SIGNED_IN }
  const approver = await approverOf(viewer.id)
  if (!approver) return { ok: true, links: [] }
  return { ok: true, links: await copyableLinksOf(viewer.id, approver) }
}

// The safety number for each other person in an encrypted chat: a code that is the same on both people's phones when each holds the
// other's keys. It is made from the public keys of every active device of both people, so it changes when a browser is linked or
// removed. Nothing here is secret. A chat that is not encrypted has no safety numbers.
export type SafetyStatus = "ready" | "they-no-device" | "you-no-device"
export type SafetyEntry = { id: string; name: string; handle: string; status: SafetyStatus; number: string | null }
export type SafetyNumbers = { ok: true; encrypted: boolean; entries: SafetyEntry[] } | LinkFailure

const SAFETY_ID_MAX = 64
const NO_CONVERSATION: LinkFailure = { ok: false, error: "That conversation doesn't exist." }

export async function safetyNumbersFor(conversationId: string): Promise<SafetyNumbers> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: NOT_SIGNED_IN }
  if (typeof conversationId !== "string" || conversationId.length === 0 || conversationId.length > SAFETY_ID_MAX) return NO_CONVERSATION
  // Only someone who has accepted the chat can see its people, so only they get its numbers.
  const conversation = await get<{ e2ee: number | string }>(
    `SELECT c.e2ee FROM conversations c
       JOIN conversation_members m ON m.conversation_id = c.id AND m.user_id = ? AND m.status = 'accepted'
      WHERE c.id = ?`,
    viewer.id,
    conversationId
  )
  if (!conversation) return NO_CONVERSATION
  if (Number(conversation.e2ee) !== 1) return { ok: true, encrypted: false, entries: [] }

  const { devices } = await memberDevicesOf(conversationId)
  const others = await all<{ id: string; name: string; handle: string }>(
    `SELECT u.id, u.name, u.handle FROM conversation_members m
       JOIN users u ON u.id = m.user_id
      WHERE m.conversation_id = ? AND m.user_id <> ? AND m.status = 'accepted' AND u.deactivated_at IS NULL
      ORDER BY u.handle ASC`,
    conversationId,
    viewer.id
  )
  const mine = devices.filter((device) => device.user_id === viewer.id)
  const entries: SafetyEntry[] = []
  for (const other of others) {
    const theirs = devices.filter((device) => device.user_id === other.id)
    const person = { id: other.id, name: other.name, handle: other.handle }
    if (theirs.length === 0) entries.push({ ...person, status: "they-no-device", number: null })
    else if (mine.length === 0) entries.push({ ...person, status: "you-no-device", number: null })
    else entries.push({ ...person, status: "ready", number: await safetyNumber(keysOf(mine), keysOf(theirs)) })
  }
  return { ok: true, encrypted: true, entries }
}

// The public keys of a person's devices, as a safety number takes them.
function keysOf(devices: MemberDevice[]): string[] {
  return devices.flatMap((device) => [device.signing_key, device.agreement_key])
}

// Approves a link from this browser's device. The new device is listed with the account at once.
export async function approveDeviceLink(code: string): Promise<LinkApproval> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: NOT_SIGNED_IN }
  const checked = linkCodeInput(code)
  if (!checked.ok) return checked
  const approver = await approverOf(viewer.id)
  if (!approver) return { ok: false, error: NOT_A_DEVICE }
  return approveLink(viewer.id, approver, checked.code)
}

// The device an approved link made, and its public key, for this browser to copy the account's keys to.
export async function copyTargetForLink(code: string): Promise<CopyTarget> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: NOT_SIGNED_IN }
  const checked = linkCodeInput(code)
  if (!checked.ok) return checked
  const approver = await approverOf(viewer.id)
  if (!approver) return { ok: false, error: NOT_A_DEVICE }
  return copyTargetOf(viewer.id, approver, checked.code)
}

// The next batch of the account's message keys this device holds and the new device does not, after the given message.
export async function historyBatchForLink(code: string, after: unknown): Promise<HistoryPage> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: NOT_SIGNED_IN }
  const checked = linkCodeInput(code)
  if (!checked.ok) return checked
  const cursor = historyCursorInput(after)
  if (!cursor.ok) return cursor
  const approver = await approverOf(viewer.id)
  if (!approver) return { ok: false, error: NOT_A_DEVICE }
  return historyPageOf(viewer.id, approver, checked.code, cursor.after)
}

// Stores the keys this device copied for the new device. Each must be for a message in an encrypted chat the account is in.
export async function storeCopiedKeys(code: string, wraps: unknown): Promise<CopyResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: NOT_SIGNED_IN }
  const checked = linkCodeInput(code)
  if (!checked.ok) return checked
  const batch = historyWrapsInput(wraps)
  if (!batch.ok) return batch
  const approver = await approverOf(viewer.id)
  if (!approver) return { ok: false, error: NOT_A_DEVICE }
  return storeHistoryWraps(viewer.id, approver, checked.code, batch.wraps)
}

export async function myDevices(): Promise<LinkedDevice[]> {
  const viewer = await getAgreedViewer()
  if (!viewer) return []
  const current = await deviceCookieFor(viewer.id)
  const rows = await activeDevicesOf(viewer.id)
  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    createdAt: Number(row.created_at),
    current: row.id === current,
  }))
}

export async function removeDevice(deviceId: string): Promise<DeviceRemoval> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: NOT_SIGNED_IN }
  if (typeof deviceId !== "string" || deviceId.length === 0 || deviceId.length > 128) {
    return { ok: false, error: "That device is not linked to your account." }
  }
  const removed = await revokeDevice(viewer.id, deviceId)
  if (!removed) return { ok: false, error: "That device is not linked to your account." }
  if ((await deviceCookieFor(viewer.id)) === deviceId) await forgetDeviceFor(viewer.id)
  return { ok: true }
}

// The device this browser is for the account, when that device is still linked. Only such a browser may approve a link or copy keys.
async function approverOf(userId: string): Promise<string | null> {
  const current = await deviceCookieFor(userId)
  if (!current) return null
  return (await activeDeviceOf(userId, current)) ? current : null
}
