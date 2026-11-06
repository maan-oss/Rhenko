"use server"

import { getAgreedViewer } from "@/lib/auth"
import {
  activeDevicesOf,
  deviceCookieFor,
  forgetDeviceFor,
  registerDevice,
  rememberDeviceFor,
  revokeDevice,
  thisDeviceOf,
} from "@/lib/e2ee-devices"

// The device this browser is for the signed-in account. The browser keeps the private keys; the server only sees public halves.
export type ThisDevice = { id: string; label: string } | null

export type DeviceSetup = { ok: true; deviceId: string } | { ok: false; error: string }

export type LinkedDevice = { id: string; label: string; createdAt: number; current: boolean }

export type DeviceRemoval = { ok: true } | { ok: false; error: string }

const NOT_SIGNED_IN = "Sign in to use encrypted messages."

export async function thisDevice(): Promise<ThisDevice> {
  const viewer = await getAgreedViewer()
  if (!viewer) return null
  const row = await thisDeviceOf(viewer.id)
  return row ? { id: row.id, label: row.label } : null
}

// Called by a browser after it creates its keys. Links the device to the account and remembers it in this browser.
export async function setUpThisDevice(input: { agreement: string; signing: string; label: string }): Promise<DeviceSetup> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: NOT_SIGNED_IN }
  const result = await registerDevice(viewer.id, input)
  if (!result.ok) return result
  await rememberDeviceFor(viewer.id, result.id)
  return { ok: true, deviceId: result.id }
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
