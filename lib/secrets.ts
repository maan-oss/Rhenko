import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { DATA_DIR } from "@/lib/db"

// Secrets stored in the database (two-factor keys) are encrypted with one server key. The key comes from
// RHENKO_SECRET when it is set. Otherwise the server creates data/secret.key on first use and keeps it there,
// so back that file up with the database. Changing or losing the key makes stored two-factor keys unreadable;
// recovery codes still work for those accounts.

let cached: Buffer | null = null

function serverKey(): Buffer {
  if (cached) return cached
  const fromEnv = process.env.RHENKO_SECRET
  if (fromEnv && fromEnv.length >= 16) {
    cached = createHash("sha256").update(fromEnv).digest()
    return cached
  }
  const file = path.join(DATA_DIR, "secret.key")
  if (!fs.existsSync(file)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    try {
      fs.writeFileSync(file, randomBytes(32).toString("base64"), { mode: 0o600, flag: "wx" })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
    }
  }
  cached = Buffer.from(fs.readFileSync(file, "utf8").trim(), "base64")
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
