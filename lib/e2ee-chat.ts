// End-to-end encrypted chats, shared by the server and the browser: the switch that turns them on, what a message carries inside
// its encryption, and what the server returns for an encrypted message. The message crypto is in lib/e2ee.ts; the keys stay on
// the devices that hold them.

import { MAX_DM } from "@/lib/rules"

// Turned on by RHENKO_E2EE=1. While it is off, new chats are plaintext, as they were before, and nothing is encrypted.
export function encryptedChatsEnabled(): boolean {
  return process.env.RHENKO_E2EE === "1"
}

// What a banner, the chats list or a push says about an encrypted message. The server never knows what it says.
export const ENCRYPTED_PREVIEW = "Encrypted message"

// What a message carries inside its encryption. The server never reads it: it stores the encrypted form and each device's wrap.
export type TextPayload = { kind: "text"; body: string }

export type MessagePayload = TextPayload

// Checks a payload a device decrypted. The server does not run this, because it never sees the payload.
export function parsePayload(value: unknown): MessagePayload | null {
  if (!value || typeof value !== "object") return null
  const v = value as Record<string, unknown>
  if (v.kind !== "text" || typeof v.body !== "string") return null
  if ([...v.body].length > MAX_DM) return null
  return { kind: "text", body: v.body }
}

// A device's copy of the message key, as the server returns it to the device it belongs to.
export type SealedWrap = { epk: string; iv: string; key: string }

// An encrypted message as a reader's device receives it: the envelope (JSON, see lib/e2ee.ts) and this device's wrap. The wrap is
// null when no copy was made for this device, for example a message sent before the device was linked.
export type SealedView = { envelope: string; wrap: SealedWrap | null }

// The message's body as the server holds it for an encrypted message: empty. Everything else the thread shows is decided on the
// device after it opens the payload.
export const SEALED_BODY = ""
