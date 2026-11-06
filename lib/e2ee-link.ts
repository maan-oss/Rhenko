// Linking a browser to an account that already has devices: the link requests, their approval, and copying the account's message keys
// to the device a link made. The rules are in lib/e2ee-link-rules.ts; the devices are in lib/e2ee-devices.ts. The server holds only
// public keys and ciphertext here: a copied key is wrapped for the new device, so only that device can open it.

import { randomInt } from "node:crypto"
import { newId } from "@/lib/auth"
import { all, get, run, transaction } from "@/lib/db"
import { MAX_DEVICES_PER_USER } from "@/lib/e2ee-rules"
import {
  HISTORY_BATCH_MAX,
  LINK_CODE_DIGITS,
  LINK_COPY_MS,
  LINK_PENDING_MAX,
  LINK_WAIT_MS,
  type CopiedWrap,
} from "@/lib/e2ee-link-rules"

export type LinkFailure = { ok: false; error: string }
export type LinkStart = { ok: true; code: string; expiresAt: number } | LinkFailure
export type PendingLink = { code: string; label: string; createdAt: number }
export type LinkState = { status: "waiting" } | { status: "approved"; deviceId: string } | { status: "expired" }
export type HistoryRow = { messageId: string; conversationId: string; cipher: string; epk: string; iv: string; key: string }

const NOT_APPROVED = "This link isn't approved from a device you're signed in on."

// A new browser asks to be linked. Its code is six digits, unique among the links waiting now.
export async function startLink(userId: string, value: { agreement: string; signing: string; label: string }): Promise<LinkStart> {
  const now = Date.now()
  const waiting = await get<{ c: number | string }>(
    "SELECT COUNT(*) AS c FROM e2ee_link_requests WHERE user_id = ? AND approved_device IS NULL AND expires_at > ?",
    userId,
    now
  )
  if (Number(waiting?.c ?? 0) >= LINK_PENDING_MAX) {
    return { ok: false, error: "Too many links are waiting. Approve one, or let one expire, first." }
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = String(randomInt(0, 10 ** LINK_CODE_DIGITS)).padStart(LINK_CODE_DIGITS, "0")
    if (await get("SELECT code FROM e2ee_link_requests WHERE code = ?", code)) continue
    const expiresAt = now + LINK_WAIT_MS
    await run(
      "INSERT INTO e2ee_link_requests (code, user_id, agreement_key, signing_key, label, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
      code,
      userId,
      value.agreement,
      value.signing,
      value.label,
      expiresAt
    )
    return { ok: true, code, expiresAt }
  }
  return { ok: false, error: "Couldn't start a link. Try again." }
}

// The links waiting for an approval on this account, newest first.
export async function pendingLinksOf(userId: string): Promise<PendingLink[]> {
  const rows = await all<{ code: string; label: string; expires_at: number | string }>(
    "SELECT code, label, expires_at FROM e2ee_link_requests WHERE user_id = ? AND approved_device IS NULL AND expires_at > ? ORDER BY expires_at DESC",
    userId,
    Date.now()
  )
  return rows.map((row) => ({ code: row.code, label: row.label, createdAt: Number(row.expires_at) - LINK_WAIT_MS }))
}

// Approves a waiting link from one of the account's devices, and makes the device it is for, so it is listed with the account at once.
// The history is copied to it afterwards.
export async function approveLink(userId: string, approverId: string, code: string): Promise<{ ok: true; deviceId: string } | LinkFailure> {
  return transaction(async (): Promise<{ ok: true; deviceId: string } | LinkFailure> => {
    // Serialises approvals for one account, so two at once cannot both pass the device limit.
    await get("SELECT id FROM users WHERE id = ? FOR UPDATE", userId)
    const row = await get<{
      agreement_key: string
      signing_key: string
      label: string
      expires_at: number | string
      approved_device: string | null
    }>(
      "SELECT agreement_key, signing_key, label, expires_at, approved_device FROM e2ee_link_requests WHERE code = ? AND user_id = ? FOR UPDATE",
      code,
      userId
    )
    if (!row || row.approved_device !== null || Number(row.expires_at) <= Date.now()) {
      return { ok: false, error: "That code has expired or was already used." }
    }
    const counted = await get<{ c: number | string }>(
      "SELECT COUNT(*) AS c FROM e2ee_devices WHERE user_id = ? AND revoked_at IS NULL",
      userId
    )
    if (Number(counted?.c ?? 0) >= MAX_DEVICES_PER_USER) {
      return { ok: false, error: `You can link up to ${MAX_DEVICES_PER_USER} devices. Remove one first.` }
    }
    const deviceId = newId()
    const now = Date.now()
    await run(
      "INSERT INTO e2ee_devices (id, user_id, agreement_key, signing_key, label, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      deviceId,
      userId,
      row.agreement_key,
      row.signing_key,
      row.label,
      now
    )
    await run(
      "UPDATE e2ee_link_requests SET approved_device = ?, device_id = ?, expires_at = ? WHERE code = ?",
      approverId,
      deviceId,
      now + LINK_COPY_MS,
      code
    )
    return { ok: true, deviceId }
  })
}

// How the browser that asked for a link sees it: waiting, approved (with the device it is now), or expired.
export async function linkStateOf(userId: string, code: string): Promise<LinkState> {
  const row = await get<{ expires_at: number | string; approved_device: string | null; device_id: string | null }>(
    "SELECT expires_at, approved_device, device_id FROM e2ee_link_requests WHERE code = ? AND user_id = ?",
    code,
    userId
  )
  if (!row) return { status: "expired" }
  if (row.approved_device !== null && row.device_id !== null) return { status: "approved", deviceId: row.device_id }
  if (Number(row.expires_at) <= Date.now()) return { status: "expired" }
  return { status: "waiting" }
}

// The device an approved link was made for, for the approving device only. Null for any other device, or when the link has run out.
async function approvedLink(userId: string, approverId: string, code: string): Promise<{ deviceId: string } | null> {
  const row = await get<{ device_id: string | null; expires_at: number | string }>(
    "SELECT device_id, expires_at FROM e2ee_link_requests WHERE code = ? AND user_id = ? AND approved_device = ?",
    code,
    userId,
    approverId
  )
  if (!row || row.device_id === null || Number(row.expires_at) <= Date.now()) return null
  return { deviceId: row.device_id }
}

// The new device and its public agreement key, for the approving device to copy keys to.
export async function copyTargetOf(
  userId: string,
  approverId: string,
  code: string
): Promise<{ ok: true; deviceId: string; agreement: string } | LinkFailure> {
  const link = await approvedLink(userId, approverId, code)
  if (!link) return { ok: false, error: NOT_APPROVED }
  const device = await get<{ agreement_key: string }>(
    "SELECT agreement_key FROM e2ee_devices WHERE id = ? AND user_id = ? AND revoked_at IS NULL",
    link.deviceId,
    userId
  )
  if (!device) return { ok: false, error: NOT_APPROVED }
  return { ok: true, deviceId: link.deviceId, agreement: device.agreement_key }
}

// The next batch of messages the approving device can open and the new device cannot yet, after the given message id. Oldest first by
// id, so the copy goes on from where it stopped.
export async function historyPageOf(
  userId: string,
  approverId: string,
  code: string,
  after: string
): Promise<{ ok: true; rows: HistoryRow[] } | LinkFailure> {
  const link = await approvedLink(userId, approverId, code)
  if (!link) return { ok: false, error: NOT_APPROVED }
  const rows = await all<HistoryRow>(
    `SELECT m.id AS "messageId", m.conversation_id AS "conversationId", m.cipher, w.epk, w.iv, w.key
     FROM chat_message_wraps w
     JOIN chat_messages m ON m.id = w.message_id
     JOIN conversation_members cm ON cm.conversation_id = m.conversation_id AND cm.user_id = ? AND cm.status = 'accepted'
     WHERE w.device_id = ? AND m.cipher IS NOT NULL AND m.deleted_at IS NULL AND (m.expires_at IS NULL OR m.expires_at > ?)
       AND m.id > ? AND NOT EXISTS (SELECT 1 FROM chat_message_wraps t WHERE t.message_id = m.id AND t.device_id = ?)
     ORDER BY m.id
     LIMIT ?`,
    userId,
    approverId,
    Date.now(),
    after,
    link.deviceId,
    HISTORY_BATCH_MAX
  )
  return { ok: true, rows }
}

// Stores the copied keys for the new device. A copy for a message the account can't read in an encrypted chat is skipped.
export async function storeHistoryWraps(
  userId: string,
  approverId: string,
  code: string,
  wraps: CopiedWrap[]
): Promise<{ ok: true; count: number } | LinkFailure> {
  const link = await approvedLink(userId, approverId, code)
  if (!link) return { ok: false, error: NOT_APPROVED }
  let count = 0
  await transaction(async () => {
    for (const wrap of wraps) {
      const message = await get(
        `SELECT m.id FROM chat_messages m
         JOIN conversation_members cm ON cm.conversation_id = m.conversation_id AND cm.user_id = ? AND cm.status = 'accepted'
         WHERE m.id = ? AND m.cipher IS NOT NULL AND m.deleted_at IS NULL`,
        userId,
        wrap.messageId
      )
      if (!message) continue
      await run(
        "INSERT INTO chat_message_wraps (message_id, device_id, epk, iv, key) VALUES (?, ?, ?, ?, ?) ON CONFLICT (message_id, device_id) DO NOTHING",
        wrap.messageId,
        link.deviceId,
        wrap.epk,
        wrap.iv,
        wrap.key
      )
      count++
    }
  })
  return { ok: true, count }
}

// Drops the links that have run out. The maintenance pass calls it.
export async function removeExpiredLinks(now: number): Promise<void> {
  await run("DELETE FROM e2ee_link_requests WHERE expires_at <= ?", now)
}
