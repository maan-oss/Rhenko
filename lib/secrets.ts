import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto"

// Secrets stored in the database (two-factor keys) are encrypted with one server key, which comes from RHENKO_SECRET.
// Changing or losing that value makes stored two-factor keys unreadable; recovery codes still work for those accounts.

let cached: Buffer | null = null

function serverKey(): Buffer {
  if (cached) return cached
  const secret = process.env.RHENKO_SECRET
  if (!secret || secret.length < 16) {
    throw new Error("RHENKO_SECRET must be set to at least 16 characters. It keys the encrypted two-factor secrets and codes.")
  }
  cached = createHash("sha256").update(secret).digest()
  return cached
}

// Encrypts text with AES-256-GCM. The result starts with "v1:" so a stored value can be told apart from plain text.
export function encryptText(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", serverKey(), iv)
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1:${Buffer.concat([iv, tag, body]).toString("base64url")}`
}

// Returns the plain text, or null when the value is not ours or cannot be opened with this key.
export function decryptText(stored: string): string | null {
  if (!isEncrypted(stored)) return null
  try {
    const raw = Buffer.from(stored.slice(3), "base64url")
    const decipher = createDecipheriv("aes-256-gcm", serverKey(), raw.subarray(0, 12))
    decipher.setAuthTag(raw.subarray(12, 28))
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8")
  } catch {
    return null
  }
}

export function isEncrypted(stored: string): boolean {
  return stored.startsWith("v1:")
}

// A keyed hash for values that are short or guessable, such as recovery and email codes. Without the server key
// a leaked database cannot be searched for them.
export function keyedHash(purpose: string, value: string): string {
  return createHmac("sha256", serverKey()).update(`${purpose}:${value}`).digest("hex")
}
