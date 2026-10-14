// The rules for the human check and the form timing check. Pure: no database, no Node-only modules, so the server, the
// browser that solves a puzzle and the tests all use the same code. lib/proof.ts keeps the challenges and asks Turnstile.

export const MIN_BITS = 8
export const MAX_BITS = 22
// The difficulty of an ordinary puzzle. A quiet network gets this; a network that has asked for many recently gets more.
export const BASE_BITS = 16
export const PROOF_TTL_MS = 5 * 60 * 1000
// A sign-up form is three steps, so a person needs more than this to fill it. A program does not.
export const FORM_MIN_MS = 1500
export const FORM_MAX_MS = 2 * 60 * 60 * 1000

// The number of zero bits at the front of a hex digest.
export function leadingZeroBits(hex: string): number {
  let bits = 0
  for (const char of hex) {
    const value = Number.parseInt(char, 16)
    if (Number.isNaN(value)) return bits
    if (value === 0) {
      bits += 4
      continue
    }
    // Math.clz32 counts zeros in 32 bits; a hex digit has 4, so 28 of them are the top bits we do not want.
    return bits + Math.clz32(value) - 28
  }
  return bits
}

export function meetsDifficulty(hex: string, bits: number): boolean {
  return leadingZeroBits(hex) >= bits
}

// The text a solver hashes for a puzzle. The salt is chosen by the server, the nonce by the browser.
export function puzzleInput(salt: string, nonce: string): string {
  return `${salt}:${nonce}`
}

export function clampBits(bits: number): number {
  return Math.min(MAX_BITS, Math.max(MIN_BITS, Math.round(bits)))
}

// How hard a puzzle is for a network. `recent` is how many puzzles that network was given in the last ten minutes.
export function bitsFor(recent: number, base: number = BASE_BITS): number {
  const extra = recent >= 40 ? 4 : recent >= 10 ? 2 : 0
  return clampBits(base + extra)
}

// A proof a browser sends back. Anything else is refused.
export type ProofAnswer = { kind: "pow"; id: string; nonce: string } | { kind: "turnstile"; token: string }

const ID_PATTERN = /^[a-f0-9]{32}$/
const NONCE_PATTERN = /^[a-z0-9]{1,24}$/
const TOKEN_MAX = 2048

// Checks the shape of a proof sent from a form. The value is the JSON the check component produced, or nothing.
export function parseAnswer(raw: unknown): ProofAnswer | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 4096) return null
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof value !== "object" || value === null) return null
  const record = value as Record<string, unknown>
  if (record.kind === "pow") {
    if (typeof record.id !== "string" || !ID_PATTERN.test(record.id)) return null
    if (typeof record.nonce !== "string" || !NONCE_PATTERN.test(record.nonce)) return null
    return { kind: "pow", id: record.id, nonce: record.nonce }
  }
  if (record.kind === "turnstile") {
    if (typeof record.token !== "string" || record.token.length === 0 || record.token.length > TOKEN_MAX) return null
    return { kind: "turnstile", token: record.token }
  }
  return null
}

// A form's start time is sent with the form as "<milliseconds>.<signature>". This splits it; the signature is checked by
// the caller, which holds the key.
export function parseStamp(stamp: unknown): { time: string; signature: string } | null {
  if (typeof stamp !== "string") return null
  const dot = stamp.indexOf(".")
  if (dot <= 0) return null
  const time = stamp.slice(0, dot)
  const signature = stamp.slice(dot + 1)
  if (!/^\d{10,16}$/.test(time) || !/^[a-f0-9]{64}$/.test(signature)) return null
  return { time, signature }
}

// Whether the time between the form being shown and sent is one a person could take.
export function formTimeOk(startedAt: number, now: number): boolean {
  const age = now - startedAt
  return age >= FORM_MIN_MS && age <= FORM_MAX_MS
}

// Turnstile answers with a JSON object. Only an explicit success counts.
export function turnstileAccepted(body: unknown): boolean {
  return typeof body === "object" && body !== null && (body as { success?: unknown }).success === true
}
