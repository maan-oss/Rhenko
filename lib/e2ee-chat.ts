// End-to-end encrypted chats, shared by the server and the browser: the switch that turns them on, what a message carries inside its
// encryption (lib/e2ee-payload.ts), and what the server returns for an encrypted message. The message crypto is in lib/e2ee.ts and the
// file crypto in lib/e2ee-media.ts; the keys stay on the devices that hold them.

import type { SealedMediaKind } from "@/lib/e2ee-payload"
import type { MiniUser } from "@/lib/data"

export * from "@/lib/e2ee-payload"

// Turned on by RHENKO_E2EE=1. While it is off, new chats are plaintext, as they were before, and nothing is encrypted.
export function encryptedChatsEnabled(): boolean {
  return process.env.RHENKO_E2EE === "1"
}

// A device's copy of the message key, as the server returns it to the device it belongs to.
export type SealedWrap = { epk: string; iv: string; key: string }

// An encrypted message as a reader's device receives it: the envelope (JSON, see lib/e2ee.ts), this device's wrap and, for a file,
// the stored name of its ciphertext. The wrap is null when no copy was made for this device, for example a message sent before the
// device was linked. The file is null for a text message.
export type SealedView = { envelope: string; wrap: SealedWrap | null; file: string | null }

// A file in an encrypted message once this device has opened its payload: the details the payload gives, and where the ciphertext
// is stored. The bytes are fetched and opened only when the message shows them.
export type SealedMediaView = {
  file: string
  media: SealedMediaKind
  mime: string
  name: string
  size: number
  key: string
  iv: string
  scan: boolean
  viewOnce: boolean
}

// What an encrypted message shows beyond its words, as this device reads it: the file, the place, the account or the poll it carries.
// Only the devices in the chat know these details. The server knows a poll's choice ids, so votes can be counted, and nothing else.
export type SealedAttachmentView =
  | { kind: "media"; media: SealedMediaView }
  | { kind: "location"; lat: number; lng: number }
  | { kind: "contact"; user: MiniUser | null }
  | { kind: "poll"; question: string; options: Array<{ id: string; label: string }>; multiple: boolean }

// The message's body as the server holds it for an encrypted message: empty. Everything else the thread shows is decided on the
// device after it opens the payload.
export const SEALED_BODY = ""
