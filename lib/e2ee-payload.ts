// What a sealed message carries inside its encryption, and the checks a device makes on it before it shows it. This module has no
// imports, so the test suite can run it on its own; its limits are the ones in lib/rules.ts and lib/poll-rules.ts, and the tests hold
// them equal.

// The most text a message's caption or text may have (MAX_DM in lib/rules.ts).
export const PAYLOAD_TEXT_MAX = 1000
// The largest file a sealed message may carry (MAX_DOCUMENT_BYTES in lib/rules.ts).
export const PAYLOAD_FILE_MAX_BYTES = 25 * 1024 * 1024
// The poll limits (lib/poll-rules.ts).
export const PAYLOAD_POLL_QUESTION_MAX = 255
export const PAYLOAD_POLL_CHOICE_MAX = 100
export const PAYLOAD_POLL_CHOICES_MIN = 2
export const PAYLOAD_POLL_CHOICES_MAX = 12

// What a banner, the chats list, a push, a reminder or a digest says about an encrypted message. The server never knows what it says.
export const ENCRYPTED_PREVIEW = "Sent a message"

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
// its bytes are encrypted with. A contact names an account in the chat, a location is a place, and a poll is its question and choices.
// The stored message holds only what the server must act on (a poll's choice ids, so votes can be counted), never these words.
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

export type ContactPayload = { kind: "contact"; body: string; userId: string }

export type LocationPayload = { kind: "location"; body: string; lat: number; lng: number }

export type PollPayload = {
  kind: "poll"
  body: string
  question: string
  options: Array<{ id: string; label: string }>
  multiple: boolean
}

export type MessagePayload = TextPayload | MediaPayload | ContactPayload | LocationPayload | PollPayload

const KEY_B64 = /^[A-Za-z0-9+/]{43}=$/
const IV_B64 = /^[A-Za-z0-9+/]{16}$/
const MAX_NAME_CHARS = 255
const MAX_ID_CHARS = 128

// Checks a payload a device decrypted. The server does not run this, because it never sees the payload.
export function parsePayload(value: unknown): MessagePayload | null {
  if (!value || typeof value !== "object") return null
  const v = value as Record<string, unknown>
  if (typeof v.body !== "string" || [...v.body].length > PAYLOAD_TEXT_MAX) return null
  if (v.kind === "text") return { kind: "text", body: v.body }
  if (v.kind === "media") return parseMedia(v, v.body)
  if (v.kind === "contact") return parseContact(v, v.body)
  if (v.kind === "location") return parseLocation(v, v.body)
  if (v.kind === "poll") return parsePoll(v, v.body)
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

function parseContact(v: Record<string, unknown>, body: string): ContactPayload | null {
  if (typeof v.userId !== "string" || v.userId.length === 0 || v.userId.length > MAX_ID_CHARS) return null
  return { kind: "contact", body, userId: v.userId }
}

function parseLocation(v: Record<string, unknown>, body: string): LocationPayload | null {
  if (typeof v.lat !== "number" || typeof v.lng !== "number") return null
  if (!Number.isFinite(v.lat) || !Number.isFinite(v.lng) || Math.abs(v.lat) > 90 || Math.abs(v.lng) > 180) return null
  return { kind: "location", body, lat: v.lat, lng: v.lng }
}

function parsePoll(v: Record<string, unknown>, body: string): PollPayload | null {
  if (typeof v.question !== "string" || v.question.trim().length === 0 || [...v.question].length > PAYLOAD_POLL_QUESTION_MAX) return null
  if (typeof v.multiple !== "boolean" || !Array.isArray(v.options)) return null
  if (v.options.length < PAYLOAD_POLL_CHOICES_MIN || v.options.length > PAYLOAD_POLL_CHOICES_MAX) return null
  const options: Array<{ id: string; label: string }> = []
  for (const option of v.options) {
    if (!option || typeof option !== "object") return null
    const o = option as Record<string, unknown>
    if (typeof o.id !== "string" || o.id.length === 0 || o.id.length > MAX_ID_CHARS) return null
    if (typeof o.label !== "string" || o.label.trim().length === 0 || [...o.label].length > PAYLOAD_POLL_CHOICE_MAX) return null
    options.push({ id: o.id, label: o.label })
  }
  if (new Set(options.map((option) => option.id)).size !== options.length) return null
  return { kind: "poll", body, question: v.question, options, multiple: v.multiple }
}
