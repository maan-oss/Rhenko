// Reports of chat messages. A report holds the messages up to the one reported, as the reporter saw them, and it is sealed to
// Rhenko's report key before it is stored. The server keeps only the ciphertext. The private half of the key is kept outside the
// server, and only the moderation command line (scripts/moderation.mjs report-open) opens a report.
//
// A chat that is end-to-end encrypted is reported from the reporter's device, which opened the messages. A chat that is not is
// reported from the server's copy, and sealed there. Either way the sealing is this file.
//
// This file has no imports, so the browser, the server and the command line run the same code.

export const CHAT_REPORT_VERSION = 1
// How many messages a report carries: the one reported and up to four before it, as WhatsApp does.
export const CHAT_REPORT_MESSAGES = 5
// How long a report and its files are kept. This is one year, which is at least the period 18 U.S.C. 2258A(h) asks a provider to
// preserve a report for. Every report gets the same period, so there is one rule.
export const CHAT_REPORT_RETENTION_MS = 365 * 24 * 60 * 60 * 1000
// The largest sealed report the server accepts from a browser, in JSON characters.
export const CHAT_REPORT_MAX_SEALED = 1024 * 1024

const CURVE = "P-256"
const encoder = new TextEncoder()
const decoder = new TextDecoder()
const INFO = encoder.encode("rhenko chat report v1")

export class ReportError extends Error {}

// The public half of the report key, with the id that every report records.
export type ReportPublicKey = { kid: string; jwk: JsonWebKey }

export type ReportMedia = {
  name: string
  mime: string
  // The size in bytes, when the reporter's device knows it. Null for a file the server read.
  size: number | null
  // The stored file's name. The file is kept for as long as the report is.
  file: string
  // The key and nonce the file is sealed with, for a file in an encrypted chat. Null for a file in a chat that is not encrypted.
  key: string | null
  iv: string | null
}

export type ReportMessage = {
  id: string
  sender: { id: string; handle: string }
  sentAt: number
  text: string
  deleted: boolean
  media: ReportMedia | null
  // What the message carries besides its text (a document, a contact, a location or a poll), as the thread shows it. Null otherwise.
  attachment: unknown
}

export type ReportPayload = {
  v: typeof CHAT_REPORT_VERSION
  reason: string
  reportedMessageId: string
  conversation: { id: string; encrypted: boolean }
  // Oldest first. The reported message is the last one.
  messages: ReportMessage[]
  createdAt: number
}

export type SealedReport = { v: typeof CHAT_REPORT_VERSION; kid: string; epk: string; iv: string; ct: string }

// What a sealed report is bound to: its chat, the reported message and the key. A sealed report cannot be moved to another message,
// chat or key without the opening failing.
export function reportContext(conversationId: string, messageId: string, kid: string): string {
  return `chat-report|${conversationId}|${messageId}|${kid}`
}

// Whether a value is a P-256 public key as a JSON Web Key, and nothing that holds a private part.
export function isPublicP256Jwk(value: unknown): value is JsonWebKey {
  if (typeof value !== "object" || value === null) return false
  const key = value as Record<string, unknown>
  return key.kty === "EC" && key.crv === CURVE && typeof key.x === "string" && typeof key.y === "string" && key.d === undefined
}

// A short id for a key: the first 16 hex digits of the SHA-256 of its coordinates.
export async function reportKeyId(jwk: JsonWebKey): Promise<string> {
  if (!isPublicP256Jwk(jwk)) throw new ReportError("The report key is not valid.")
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", encoder.encode(`${jwk.x}.${jwk.y}`)))
  return [...digest.slice(0, 8)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

// Checks a value that came from a browser before the server stores it. Only the shape is checked here; the sealed bytes are opened by
// the moderation command line.
export function parseSealedReport(value: unknown): SealedReport | null {
  if (typeof value !== "object" || value === null) return null
  const sealed = value as Record<string, unknown>
  if (sealed.v !== CHAT_REPORT_VERSION) return null
  if (typeof sealed.kid !== "string" || typeof sealed.epk !== "string" || typeof sealed.iv !== "string" || typeof sealed.ct !== "string") return null
  if (sealed.kid.length > 64 || sealed.epk.length > 256 || sealed.iv.length > 64 || sealed.ct.length > CHAT_REPORT_MAX_SEALED) return null
  return { v: CHAT_REPORT_VERSION, kid: sealed.kid, epk: sealed.epk, iv: sealed.iv, ct: sealed.ct }
}

// Seals a report to the key. A fresh ephemeral key agrees with the report key, HKDF turns the result into an AES-GCM key, and the
// payload is encrypted with the context as additional data.
export async function sealReport(key: ReportPublicKey, context: string, payload: ReportPayload): Promise<SealedReport> {
  const subtle = globalThis.crypto.subtle
  const recipient = await subtle.importKey("jwk", publicJwk(key.jwk), { name: "ECDH", namedCurve: CURVE }, false, [])
  const ephemeral = await subtle.generateKey({ name: "ECDH", namedCurve: CURVE }, true, ["deriveBits"])
  const epk = new Uint8Array(await subtle.exportKey("raw", ephemeral.publicKey))
  const shared = await subtle.deriveBits({ name: "ECDH", public: recipient }, ephemeral.privateKey, 256)
  const aesKey = await deriveAes(shared, epk, rawPoint(key.jwk))
  const iv = randomBytes(12)
  const plain = encoder.encode(JSON.stringify(payload))
  const ct = await subtle.encrypt({ name: "AES-GCM", iv, additionalData: encoder.encode(context), tagLength: 128 }, aesKey, plain)
  return { v: CHAT_REPORT_VERSION, kid: key.kid, epk: toBase64(epk), iv: toBase64(iv), ct: toBase64(new Uint8Array(ct)) }
}

// Opens a sealed report with the private key it was sealed to. Throws a ReportError when the key is not the one the report names, or
// when the report was changed, or moved to another context.
export async function openReport(privateJwk: JsonWebKey, context: string, sealed: SealedReport): Promise<ReportPayload> {
  const subtle = globalThis.crypto.subtle
  const publicPart = { kty: "EC", crv: CURVE, x: privateJwk.x, y: privateJwk.y } as JsonWebKey
  if (!isPublicP256Jwk(publicPart) || typeof privateJwk.d !== "string") throw new ReportError("The report key is not valid.")
  if ((await reportKeyId(publicPart)) !== sealed.kid) throw new ReportError("This report was sealed to a different key.")
  const recipient = await subtle.importKey("jwk", { ...publicPart, d: privateJwk.d, ext: true }, { name: "ECDH", namedCurve: CURVE }, false, ["deriveBits"])
  const epk = fromBase64(sealed.epk)
  const ephemeral = await subtle.importKey("raw", epk, { name: "ECDH", namedCurve: CURVE }, false, [])
  const shared = await subtle.deriveBits({ name: "ECDH", public: ephemeral }, recipient, 256)
  const aesKey = await deriveAes(shared, epk, rawPoint(publicPart))
  let plain: ArrayBuffer
  try {
    plain = await subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(sealed.iv), additionalData: encoder.encode(context), tagLength: 128 },
      aesKey,
      fromBase64(sealed.ct)
    )
  } catch {
    throw new ReportError("This report couldn't be opened. It was changed, or it belongs to another message.")
  }
  return JSON.parse(decoder.decode(plain)) as ReportPayload
}

function publicJwk(jwk: JsonWebKey): JsonWebKey {
  return { kty: "EC", crv: CURVE, x: jwk.x, y: jwk.y, ext: true } as JsonWebKey
}

// The uncompressed point of a P-256 public key: 0x04, then x, then y.
function rawPoint(jwk: JsonWebKey): Uint8Array<ArrayBuffer> {
  if (typeof jwk.x !== "string" || typeof jwk.y !== "string") throw new ReportError("The report key is not valid.")
  return concat(new Uint8Array([4]), fromBase64Url(jwk.x), fromBase64Url(jwk.y))
}

async function deriveAes(shared: ArrayBuffer, epk: Uint8Array, recipient: Uint8Array): Promise<CryptoKey> {
  const subtle = globalThis.crypto.subtle
  const base = await subtle.importKey("raw", shared, "HKDF", false, ["deriveKey"])
  return subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: concat(epk, recipient), info: INFO },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  )
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.byteLength
  }
  return out
}

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return globalThis.crypto.getRandomValues(new Uint8Array(length))
}

function toBase64(bytes: Uint8Array): string {
  let text = ""
  for (const byte of bytes) text += String.fromCharCode(byte)
  return btoa(text)
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const text = atob(value)
  const out = new Uint8Array(text.length)
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i)
  return out
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=")
  return fromBase64(padded)
}
