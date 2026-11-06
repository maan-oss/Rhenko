// Encrypting a photo, voice note, audio file or document before it is uploaded. The file gets its own random key and nonce: the
// server holds only ciphertext, and the key travels inside the message's sealed payload (see lib/e2ee-chat.ts). The additional data
// names the conversation and the message, so a stored file cannot be moved to another message and still open. Runs in the browser
// and in the test suite.

// The error a file that cannot be opened raises. It is its own class, so this module has no imports and the test suite can run it.
export class SealedFileError extends Error {}

const CONTEXT = "rhenko media v1\n"

function contextOf(conversationId: string, messageId: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(`${CONTEXT}${conversationId}\n${messageId}`)
}

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(length))
  globalThis.crypto.getRandomValues(bytes)
  return bytes
}

export type SealedFile = { bytes: Uint8Array<ArrayBuffer>; key: string; iv: string }

// Encrypts the bytes of one file for one message. The key and nonce go into the message's payload, not beside the file.
export async function sealFile(plain: ArrayBuffer, conversationId: string, messageId: string): Promise<SealedFile> {
  const subtle = globalThis.crypto.subtle
  const raw = randomBytes(32)
  const iv = randomBytes(12)
  const key = await subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"])
  const cipher = await subtle.encrypt({ name: "AES-GCM", iv, additionalData: contextOf(conversationId, messageId), tagLength: 128 }, key, plain)
  return { bytes: new Uint8Array(cipher), key: toBase64(raw), iv: toBase64(iv) }
}

// Opens a stored file with the key and nonce from its message's payload. Throws SealedFileError when the bytes are not what was sealed
// for this message, so a file that was changed or moved is refused rather than shown.
export async function openFile(cipher: ArrayBuffer, key: string, iv: string, conversationId: string, messageId: string): Promise<ArrayBuffer> {
  const subtle = globalThis.crypto.subtle
  const contentKey = await subtle.importKey("raw", fromBase64(key), "AES-GCM", false, ["decrypt"])
  try {
    return await subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(iv), additionalData: contextOf(conversationId, messageId), tagLength: 128 },
      contentKey,
      cipher
    )
  } catch {
    throw new SealedFileError("This file couldn't be opened on this device.")
  }
}

export function toBase64(bytes: Uint8Array<ArrayBufferLike>): string {
  let text = ""
  for (const byte of bytes) text += String.fromCharCode(byte)
  return btoa(text)
}

export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
