import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import { keyedHash } from "@/lib/secrets"

// RFC 6238 time-based codes, compatible with common authenticator apps:
// SHA-1, 6 digits, 30 second steps, one step of clock drift allowed each side.
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
const STEP_SECONDS = 30
const DIGITS = 6

export function base32Encode(buf: Buffer): string {
  let bits = 0
  let value = 0
  let out = ""
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]
  return out
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/, "").replace(/\s+/g, "")
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const char of clean) {
    const index = ALPHABET.indexOf(char)
    if (index === -1) continue
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

export function generateSecret(): string {
  return base32Encode(randomBytes(20))
}

// A secret saved before secrets were encrypted: plain base32, the way generateSecret writes it.
export function isBase32Secret(value: string): boolean {
  return /^[A-Z2-7]{16,}=*$/.test(value)
}

function codeAt(secret: string, step: number): string {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(step))
  const hmac = createHmac("sha1", base32Decode(secret)).update(counter).digest()
  const offset = hmac[hmac.length - 1] & 0x0f
  const binary =
    ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3]
  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0")
}

// An authenticator code as typed, with any spaces taken out. Null unless it is six digits.
export function normalizeAppCode(input: string): string | null {
  const digits = input.replace(/\s+/g, "")
  return /^\d{6}$/.test(digits) ? digits : null
}

// Returns the time step that matched, so the caller can refuse a code that is reused. Steps at or before
// `lastStep` never match.
export function matchTotp(secret: string, code: string, lastStep: number, now = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null
  const current = Math.floor(now / 1000 / STEP_SECONDS)
  for (const step of [current - 1, current, current + 1]) {
    if (step <= lastStep) continue
    const expected = Buffer.from(codeAt(secret, step))
    const given = Buffer.from(code)
    if (expected.length === given.length && timingSafeEqual(expected, given)) return step
  }
  return null
}

export function otpauthUri(secret: string, handle: string): string {
  const label = encodeURIComponent(`Rhenko:@${handle}`)
  return `otpauth://totp/${label}?secret=${secret}&issuer=Rhenko&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`
}

const RECOVERY_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"

// A recovery code as typed, in its stored form "abcd-efgh". Case, spaces and the dash are forgiven.
// Null when it can't be a recovery code.
export function normalizeRecoveryCode(input: string): string | null {
  const compact = input.toLowerCase().replace(/[\s-]+/g, "")
  if (!/^[a-z0-9]{8}$/.test(compact)) return null
  return `${compact.slice(0, 4)}-${compact.slice(4)}`
}

// Ten one-time codes, shown once. Only their keyed hashes are stored.
export function generateRecoveryCodes(count = 10): { plain: string[]; hashes: string[] } {
  const plain: string[] = []
  for (let i = 0; i < count; i++) {
    const bytes = randomBytes(8)
    let code = ""
    for (const byte of bytes) code += RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length]
    plain.push(`${code.slice(0, 4)}-${code.slice(4, 8)}`)
  }
  return { plain, hashes: plain.map(hashRecoveryCode) }
}

// Keyed with the server key, so a copy of the database alone can't be searched for codes. Takes a normalized code.
export function hashRecoveryCode(code: string): string {
  return keyedHash("recovery", code)
}

// How codes were stored before keyed hashes: plain SHA-256 of the normalized code. Such codes still work once.
export function legacyRecoveryHash(code: string): string {
  return createHash("sha256").update(code).digest("hex")
}
