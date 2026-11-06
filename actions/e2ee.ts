"use server"

import { getAgreedViewer } from "@/lib/auth"
import {
  activeDeviceOf,
  activeDevicesOf,
  deviceCookieFor,
  forgetDeviceFor,
  registerDevice,
  rememberDeviceFor,
  revokeDevice,
  thisDeviceOf,
} from "@/lib/e2ee-devices"
import {
  approveLink,
  copyTargetOf,
  historyPageOf,
  linkStateOf,
  pendingLinksOf,
  startLink,
  storeHistoryWraps,
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
