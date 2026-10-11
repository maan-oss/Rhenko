// Authenticator codes, worked out the way lib/totp.ts works them out: RFC 6238, SHA-1, 6 digits, 30 second steps.
// The server takes the step before, the current step and the step after, and refuses any step at or below the last one
// it accepted. So each code the suite uses must come from a later step than the one before it.
import { createHmac } from "node:crypto"
import { sleep } from "./env.mjs"

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
export const STEP_MS = 30_000

export function base32Decode(input) {
  const clean = input.toUpperCase().replace(/=+$/, "").replace(/\s+/g, "")
  let bits = 0
  let value = 0
  const out = []
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

export function codeAt(secret, step) {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(step))
  const hmac = createHmac("sha1", base32Decode(secret)).update(counter).digest()
  const offset = hmac[hmac.length - 1] & 0x0f
  const binary = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3]
  return String(binary % 10 ** 6).padStart(6, "0")
}

export function currentStep(now = Date.now()) {
  return Math.floor(now / STEP_MS)
}

// One authenticator: a secret and the last step it handed out.
export class Authenticator {
  constructor(secret) {
    this.secret = secret.replace(/\s+/g, "")
    this.last = 0
    this.issued = null
  }

  // The code handed out most recently, for a check that it cannot be used again.
  lastCode() {
    if (this.issued === null) throw new Error("no code has been handed out yet")
    return this.issued
  }

  // A code the server will accept now and that is newer than every code this authenticator gave before.
  // When the next unused step is more than one step ahead of the clock, the server would not accept it yet,
  // so this waits for the clock to catch up (never longer than one step).
  async next(note) {
    let wanted = Math.max(currentStep(), this.last + 1)
    if (wanted > currentStep() + 1) {
      const waitMs = (wanted - 1) * STEP_MS - Date.now() + 600
      if (note) note(`waiting ${Math.ceil(waitMs / 1000)} seconds for the next authenticator step`)
      await sleep(Math.max(waitMs, 0))
      wanted = Math.max(currentStep(), this.last + 1)
    }
    this.last = wanted
    this.issued = codeAt(this.secret, wanted)
    return this.issued
  }

  // A code that is wrong for every step the server accepts.
  wrong() {
    const now = currentStep()
    const taken = new Set([now - 1, now, now + 1].map((step) => codeAt(this.secret, step)))
    for (let n = 0; n < 1000; n++) {
      const guess = String(100000 + ((n * 7919) % 900000))
      if (!taken.has(guess)) return guess
    }
    return "000000"
  }
}
