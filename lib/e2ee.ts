// End-to-end encryption for message content. The server stores and routes messages but cannot read them.
//
// Each message gets a random 256-bit content key. The payload (text, attachment, poll, location and so on) is encrypted with
// that key, and the result is the envelope the server stores. The content key is wrapped separately for every device that
// should read the message: an ephemeral P-256 key agreement with the device's public key, HKDF to a key-encryption key, and
// AES-256-GCM. Each wrap is one row per device, so a device only ever fetches its own wrap.
//
// The sender's device signs the envelope (conversation, message, sender, nonce and ciphertext), so a reader knows which
// device wrote it. Context is bound into every encryption, so an envelope or a wrap cannot be moved to another message or
// conversation. A server that swaps wraps can only make a message unreadable; it cannot forge one.
//
// Runs in the browser and in Node 22+, which both expose WebCrypto as globalThis.crypto.

const VERSION = 1
const MAX_PAYLOAD_BYTES = 32 * 1024
const CURVE = "P-256"
const encoder = new TextEncoder()
const decoder = new TextDecoder()

// The public halves of a device's keys, as base64 SPKI. These are what the server keeps in its directory.
export type DevicePublicKeys = { agreement: string; signing: string }

// A device's keys. The private halves are non-extractable CryptoKey objects, so they can be stored in IndexedDB on the
// device and never leave it as raw bytes.
export type DeviceKeys = {
  agreementPrivate: CryptoKey
  signingPrivate: CryptoKey
  public: DevicePublicKeys
}

// A device that should read a message, by its id and its public agreement key.
export type Recipient = { device: string; agreement: string }

// The per-device part of a message: the sender's ephemeral public key, the IV, and the wrapped content key.
export type Wrap = { epk: string; iv: string; key: string }

// The message as the server stores it. It holds no keys.
export type Envelope = {
  v: typeof VERSION
  sender: string
  iv: string
  body: string
  sig: string
}

export class E2eeError extends Error {}

export async function generateDeviceKeys(): Promise<DeviceKeys> {
  const subtle = globalThis.crypto.subtle
  const agreement = await subtle.generateKey({ name: "ECDH", namedCurve: CURVE }, false, ["deriveBits"])
  const signing = await subtle.generateKey({ name: "ECDSA", namedCurve: CURVE }, false, ["sign", "verify"])
  return {
    agreementPrivate: agreement.privateKey,
    signingPrivate: signing.privateKey,
    public: {
      agreement: await exportPublic(agreement.publicKey),
      signing: await exportPublic(signing.publicKey),
    },
  }
}

// Encrypts a payload once. Returns the envelope to store, and one wrap per recipient device to store beside it. Include the
// sender's own other devices in `recipients`, so the sender can read the message on those devices too.
export async function encryptMessage(input: {
  conversationId: string
  messageId: string
  senderDevice: string
  senderSigningPrivate: CryptoKey
  payload: unknown
  recipients: Recipient[]
}): Promise<{ envelope: Envelope; wraps: Array<Wrap & { device: string }> }> {
  const subtle = globalThis.crypto.subtle
  const plain = encoder.encode(JSON.stringify(input.payload))
  if (plain.byteLength > MAX_PAYLOAD_BYTES) throw new E2eeError("That message is too large to send.")
  if (input.recipients.length === 0) throw new E2eeError("No device is set up to read this message.")

  const context = contextOf(input.conversationId, input.messageId, input.senderDevice)
  const contentRaw = randomBytes(32)
  const contentKey = await subtle.importKey("raw", contentRaw, "AES-GCM", false, ["encrypt"])
  const bodyIv = randomBytes(12)
  const body = await subtle.encrypt({ name: "AES-GCM", iv: bodyIv, additionalData: encoder.encode(context) }, contentKey, plain)

  const wraps: Array<Wrap & { device: string }> = []
  for (const recipient of input.recipients) {
    wraps.push({ device: recipient.device, ...(await wrapFor(recipient, contentRaw, context)) })
  }

  const bodyB64 = toBase64(new Uint8Array(body))
  const ivB64 = toBase64(bodyIv)
  const signature = await subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    input.senderSigningPrivate,
    signedBytes(context, ivB64, bodyB64)
  )
  return {
    envelope: {
      v: VERSION,
      sender: input.senderDevice,
      iv: ivB64,
      body: bodyB64,
      sig: toBase64(new Uint8Array(signature)),
    },
    wraps,
  }
}

// Reads a message for one device. `wrap` is this device's wrap of the message, or null when the server has none for it.
// `senderSigning` returns the base64 SPKI signing key of a device id, or null when that device is unknown. Throws E2eeError
// when the envelope is not valid, was tampered with, is not for this device, or was not signed by the sender's device.
export async function decryptMessage(input: {
  conversationId: string
  messageId: string
  raw: string
  device: string
  wrap: Wrap | null
  agreementPrivate: CryptoKey
  senderSigning: (device: string) => string | null
}): Promise<{ payload: unknown; sender: string }> {
  const subtle = globalThis.crypto.subtle
  const envelope = parseEnvelope(input.raw)
  const context = contextOf(input.conversationId, input.messageId, envelope.sender)

  const signingKey = input.senderSigning(envelope.sender)
  if (!signingKey) throw new E2eeError("The sender of this message isn't known on this device.")
  const verifyKey = await subtle.importKey("spki", fromBase64(signingKey), { name: "ECDSA", namedCurve: CURVE }, false, ["verify"])
  const valid = await subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    verifyKey,
    fromBase64(envelope.sig),
    signedBytes(context, envelope.iv, envelope.body)
  )
  if (!valid) throw new E2eeError("This message's signature doesn't match its sender.")

  if (!input.wrap) throw new E2eeError("This message wasn't sent to this device.")
  const contentRaw = await unwrapFor(input.agreementPrivate, input.wrap, input.device, context)
  const contentKey = await subtle.importKey("raw", contentRaw, "AES-GCM", false, ["decrypt"])
  let plain: ArrayBuffer
  try {
    plain = await subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(envelope.iv), additionalData: encoder.encode(context) },
      contentKey,
      fromBase64(envelope.body)
    )
  } catch {
    throw new E2eeError("This message couldn't be opened.")
  }
  return { payload: JSON.parse(decoder.decode(plain)), sender: envelope.sender }
}

// Copies a message's content key to another device, so a device linked after the message was sent can read it. Only a device that can
// already read the message can do this. The copy is bound to the same message, conversation and sender as the original wrap.
export async function rewrapFor(input: {
  conversationId: string
  messageId: string
  raw: string
  device: string
  wrap: Wrap
  agreementPrivate: CryptoKey
  recipient: Recipient
}): Promise<Wrap> {
  const envelope = parseEnvelope(input.raw)
  const context = contextOf(input.conversationId, input.messageId, envelope.sender)
  const contentRaw = await unwrapFor(input.agreementPrivate, input.wrap, input.device, context)
  return await wrapFor(input.recipient, contentRaw, context)
}

// Safety number: a 60-digit code both people can compare to confirm they hold each other's keys. It depends on every key of
// both people, and is the same whichever of them computes it.
export async function safetyNumber(first: string[], second: string[]): Promise<string> {
  const subtle = globalThis.crypto.subtle
  const fingerprints = [await fingerprint(first), await fingerprint(second)].sort()
  // Twelve groups of five digits read four bytes each, 48 bytes in all. Two SHA-256 digests give 64 bytes, so every group has
  // real bytes behind it: one digest alone is 32 bytes, and the last groups would read past its end.
  const once = new Uint8Array(await subtle.digest("SHA-256", encoder.encode(fingerprints.join("|"))))
  const twice = new Uint8Array(await subtle.digest("SHA-256", once))
  const bytes = new Uint8Array(once.length + twice.length)
  bytes.set(once, 0)
  bytes.set(twice, once.length)
  const groups: string[] = []
  for (let i = 0; i < 12; i++) {
    const value = ((bytes[i * 4] << 24) | (bytes[i * 4 + 1] << 16) | (bytes[i * 4 + 2] << 8) | bytes[i * 4 + 3]) >>> 0
    groups.push(String(value % 100000).padStart(5, "0"))
  }
  return groups.join(" ")
}

// ---------------------------------------------------------------------------------------------------------------------

async function wrapFor(recipient: Recipient, contentRaw: Uint8Array<ArrayBuffer>, context: string): Promise<Wrap> {
  const subtle = globalThis.crypto.subtle
  const ephemeral = await subtle.generateKey({ name: "ECDH", namedCurve: CURVE }, true, ["deriveBits"])
  const recipientKey = await subtle.importKey("spki", fromBase64(recipient.agreement), { name: "ECDH", namedCurve: CURVE }, false, [])
  const kek = await keyEncryptionKey(ephemeral.privateKey, recipientKey, recipient.device, context)
  const iv = randomBytes(12)
  const wrapped = await subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(context + "|" + recipient.device) },
    kek,
    contentRaw
  )
  return { epk: await exportPublic(ephemeral.publicKey), iv: toBase64(iv), key: toBase64(new Uint8Array(wrapped)) }
}

async function unwrapFor(privateKey: CryptoKey, wrap: Wrap, device: string, context: string): Promise<Uint8Array<ArrayBuffer>> {
  const subtle = globalThis.crypto.subtle
  if (!isWrap(wrap)) throw new E2eeError("This message couldn't be opened.")
  const ephemeral = await subtle.importKey("spki", fromBase64(wrap.epk), { name: "ECDH", namedCurve: CURVE }, false, [])
  const kek = await keyEncryptionKey(privateKey, ephemeral, device, context)
  try {
    const raw = await subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(wrap.iv), additionalData: encoder.encode(context + "|" + device) },
      kek,
      fromBase64(wrap.key)
    )
    return new Uint8Array(raw) as Uint8Array<ArrayBuffer>
  } catch {
    throw new E2eeError("This message couldn't be opened.")
  }
}

// Both sides derive the same key: ECDH between the two keys, then HKDF bound to the device and the message.
async function keyEncryptionKey(privateKey: CryptoKey, publicKey: CryptoKey, device: string, context: string): Promise<CryptoKey> {
  const subtle = globalThis.crypto.subtle
  const shared = await subtle.deriveBits({ name: "ECDH", public: publicKey }, privateKey, 256)
  const base = await subtle.importKey("raw", shared, "HKDF", false, ["deriveKey"])
  return subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(32),
      info: encoder.encode(`rhenko e2ee wrap v1\n${context}\n${device}`),
    },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  )
}

// What the signature and the AES context cover. Arrays keep their order through JSON, so this is stable.
function contextOf(conversationId: string, messageId: string, sender: string): string {
  return JSON.stringify([conversationId, messageId, sender])
}

function signedBytes(context: string, iv: string, body: string): Uint8Array<ArrayBuffer> {
  return encoder.encode(JSON.stringify([context, iv, body]))
}

async function fingerprint(keys: string[]): Promise<string> {
  const sorted = [...keys].sort()
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", encoder.encode(sorted.join("\n"))))
  return toBase64(digest)
}

function parseEnvelope(raw: string): Envelope {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new E2eeError("This message couldn't be read.")
  }
  if (!isEnvelope(value)) throw new E2eeError("This message couldn't be read.")
  return value
}

function isEnvelope(value: unknown): value is Envelope {
  if (!value || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  return (
    v.v === VERSION &&
    typeof v.sender === "string" &&
    typeof v.iv === "string" &&
    typeof v.body === "string" &&
    typeof v.sig === "string"
  )
}

// The longest a stored envelope or wrap field may be, in characters. A message is capped at MAX_PAYLOAD_BYTES before encryption,
// so anything beyond this is not a message this app would have made.
const MAX_FIELD_CHARS = 128 * 1024
const MAX_DEVICE_ID_CHARS = 128

// Checks a message the sender's device wants to store, before the server saves it. The envelope must be signed by one of the
// sender's own active devices, and there must be exactly one wrap for each active device of every member of the chat (the
// sender's other devices included). A missing wrap would leave a device unable to read the message, and an extra one would
// give a device that is not in the chat a copy, so both are refused.
export type EncryptedSendInput = {
  envelope: unknown
  wraps: unknown
  senderDevice: string
  // The active devices of the sender.
  senderDevices: string[]
  // Every active device of every member of the chat, the sender's included.
  memberDevices: string[]
  // True when a member of the chat has no device yet, so nothing can be encrypted for them.
  memberWithoutDevice: boolean
}

export type EncryptedSend =
  | { ok: true; envelope: Envelope; wraps: Array<Wrap & { device: string }> }
  | { ok: false; error: string }

export function checkEncryptedSend(input: EncryptedSendInput): EncryptedSend {
  const refuse = (error: string): EncryptedSend => ({ ok: false, error })
  if (input.memberWithoutDevice) {
    return refuse("Someone in this chat hasn't turned on encrypted messages yet, so this message can't be sent.")
  }
  if (!isEnvelope(input.envelope)) return refuse("That message couldn't be sent. Try again.")
  const envelope = input.envelope
  if (envelope.iv.length > 64 || envelope.sig.length > 256 || envelope.body.length > MAX_FIELD_CHARS) {
    return refuse("That message is too large to send.")
  }
  if (envelope.sender !== input.senderDevice || !input.senderDevices.includes(input.senderDevice)) {
    return refuse("That message couldn't be sent from this device. Try again.")
  }
  if (!Array.isArray(input.wraps) || !input.wraps.every(isDeviceWrap)) return refuse("That message couldn't be sent. Try again.")
  const wraps = input.wraps as Array<Wrap & { device: string }>
  const devices = wraps.map((wrap) => wrap.device)
  const expected = new Set(input.memberDevices)
  const covered = new Set(devices)
  if (covered.size !== devices.length || covered.size !== expected.size || devices.some((device) => !expected.has(device))) {
    return refuse("A device in this chat changed while you were sending. Try again.")
  }
  return { ok: true, envelope, wraps }
}

function isDeviceWrap(value: unknown): value is Wrap & { device: string } {
  if (!isWrap(value)) return false
  const device = (value as { device?: unknown }).device
  return (
    typeof device === "string" &&
    device.length > 0 &&
    device.length <= MAX_DEVICE_ID_CHARS &&
    value.epk.length <= 512 &&
    value.iv.length <= 64 &&
    value.key.length <= 512
  )
}

function isWrap(value: unknown): value is Wrap {
  if (!value || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  return typeof v.epk === "string" && typeof v.iv === "string" && typeof v.key === "string"
}

async function exportPublic(key: CryptoKey): Promise<string> {
  return toBase64(new Uint8Array(await globalThis.crypto.subtle.exportKey("spki", key)))
}

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(length))
  globalThis.crypto.getRandomValues(bytes)
  return bytes
}

function toBase64(bytes: Uint8Array<ArrayBufferLike>): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
