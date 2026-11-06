// What a sealed message carries inside its encryption, and the checks a device makes on it before it shows it. This module has no
// imports, so the test suite can run it on its own; its limits are the ones in lib/rules.ts, and the tests hold them equal.

// The most text a message's caption or text may have (MAX_DM in lib/rules.ts).
export const PAYLOAD_TEXT_MAX = 1000
// The largest file a sealed message may carry (MAX_DOCUMENT_BYTES in lib/rules.ts).
export const PAYLOAD_FILE_MAX_BYTES = 25 * 1024 * 1024

// The kinds of file an encrypted chat carries. A video is not among them: the server cannot strip the location and device details from
// a file it cannot read, so videos wait until that can be done on the device.
export const SEALED_MEDIA_KINDS = ["image", "voice", "audio", "document"] as const
export type SealedMediaKind = (typeof SEALED_MEDIA_KINDS)[number]

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
const PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation"

// The types each kind may carry. A payload naming any other type is refused, so a file is never shown as a type it is not.
const SEALED_MIMES: Record<SealedMediaKind, readonly string[]> = {
  image: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  voice: ["audio/webm", "audio/mp4", "audio/ogg"],
  audio: ["audio/mpeg", "audio/wav", "audio/mp4", "audio/webm", "audio/ogg"],
  document: ["application/pdf", "text/plain", "text/csv", DOCX, XLSX, PPTX, "application/zip"],
}

export function isSealableMime(kind: SealedMediaKind, mime: string): boolean {
  return SEALED_MIMES[kind].includes(mime)
}

// A text message is its words. A file message is its caption (the words that come with it) and the file's details, including the key
// its bytes are encrypted with. The stored file is only ciphertext, and the key is what opens it.
export type TextPayload = { kind: "text"; body: string }

export type MediaPayload = {
  kind: "media"
  body: string
  media: SealedMediaKind
  mime: string
  name: string
  size: number
  // The file's own key and its nonce, both base64. Random for each file, so no two files share a key.
  key: string
  iv: string
  // A photo that was marked as a scan, and a photo the recipients may open once.
  scan: boolean
  viewOnce: boolean
}

export type MessagePayload = TextPayload | MediaPayload

const KEY_B64 = /^[A-Za-z0-9+/]{43}=$/
const IV_B64 = /^[A-Za-z0-9+/]{16}$/
const MAX_NAME_CHARS = 255

// Checks a payload a device decrypted. The server does not run this, because it never sees the payload.
export function parsePayload(value: unknown): MessagePayload | null {
  if (!value || typeof value !== "object") return null
  const v = value as Record<string, unknown>
  if (typeof v.body !== "string" || [...v.body].length > PAYLOAD_TEXT_MAX) return null
  if (v.kind === "text") return { kind: "text", body: v.body }
  if (v.kind === "media") return parseMedia(v, v.body)
  return null
}

function parseMedia(v: Record<string, unknown>, body: string): MediaPayload | null {
  const media = SEALED_MEDIA_KINDS.find((kind) => kind === v.media)
  if (!media) return null
  if (typeof v.mime !== "string" || !isSealableMime(media, v.mime)) return null
  if (typeof v.name !== "string" || v.name.length === 0 || [...v.name].length > MAX_NAME_CHARS) return null
  if (typeof v.size !== "number" || !Number.isInteger(v.size) || v.size < 0 || v.size > PAYLOAD_FILE_MAX_BYTES) return null
  if (typeof v.key !== "string" || !KEY_B64.test(v.key)) return null
  if (typeof v.iv !== "string" || !IV_B64.test(v.iv)) return null
  if (typeof v.scan !== "boolean" || typeof v.viewOnce !== "boolean") return null
  return {
    kind: "media",
    body,
    media,
    mime: v.mime,
    name: v.name,
    size: v.size,
    key: v.key,
    iv: v.iv,
    scan: v.scan,
    viewOnce: v.viewOnce,
  }
}
