// The human check. The server gives out a puzzle that a browser solves in a second or two (a proof of work: a number that
// makes a hash start with a set number of zero bits). A puzzle is used up by any answer and expires after a few minutes.
// When RHENKO_TURNSTILE_SITE_KEY and RHENKO_TURNSTILE_SECRET_KEY are both set, Cloudflare Turnstile is used instead, and
// its answer is checked with Cloudflare. The rules are in lib/proof-rules.ts.
//
// Form start times are signed here too, so a form that was filled in less than a person needs is refused.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto"
import { get, run } from "@/lib/db"
import { keyedHash } from "@/lib/secrets"
import {
  BASE_BITS,
  bitsFor,
  clampBits,
  formTimeOk,
  meetsDifficulty,
  parseStamp,
  PROOF_TTL_MS,
  puzzleInput,
  turnstileAccepted,
  type ProofAnswer,
} from "@/lib/proof-rules"

export type ProofSpec = { kind: "pow"; id: string; salt: string; bits: number } | { kind: "turnstile"; siteKey: string }

const MINUTE = 60 * 1000
const TURNSTILE_VERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

export function turnstileSiteKey(): string | null {
  const siteKey = process.env.RHENKO_TURNSTILE_SITE_KEY?.trim()
  const secret = process.env.RHENKO_TURNSTILE_SECRET_KEY?.trim()
  return siteKey && secret ? siteKey : null
}

// RHENKO_PROOF_BITS sets the base difficulty. Tests set it low so each sign-up is quick; production leaves it alone.
function baseBits(): number {
  const raw = Number(process.env.RHENKO_PROOF_BITS)
  return Number.isFinite(raw) && raw > 0 ? clampBits(raw) : BASE_BITS
}

// A keyed hash of the network address, or null when the address is not known (no proxy header was sent).
export function networkHash(ip: string): string | null {
  return ip === "local" ? null : keyedHash("network", ip)
}

// Gives a browser the check to run. Turnstile when it is configured; otherwise a puzzle, harder for a busy network.
export function issueProof(ip: string, now = Date.now()): ProofSpec {
  const siteKey = turnstileSiteKey()
  if (siteKey) return { kind: "turnstile", siteKey }
  const hash = networkHash(ip)
  const recent = hash
    ? (get<{ n: number }>("SELECT COUNT(*) AS n FROM proof_challenges WHERE ip_hash = ? AND created_at >= ?", hash, now - 10 * MINUTE)?.n ?? 0)
    : 0
  const bits = bitsFor(recent, baseBits())
  const id = randomBytes(16).toString("hex")
  const salt = randomBytes(12).toString("base64url")
  run(
    "INSERT INTO proof_challenges (id, salt, bits, ip_hash, created_at, expires_at, used_at) VALUES (?, ?, ?, ?, ?, ?, NULL)",
    id,
    salt,
    bits,
    hash,
    now,
    now + PROOF_TTL_MS
  )
  return { kind: "pow", id, salt, bits }
}

// Whether the answer is a correct one. A puzzle is used up by the first answer, right or wrong, so it cannot be tried again.
// Turnstile tokens are single-use at Cloudflare.
export async function verifyProof(answer: ProofAnswer, now = Date.now()): Promise<boolean> {
  if (answer.kind === "turnstile") return verifyTurnstile(answer.token)
  const row = get<{ salt: string; bits: number; expires_at: number; used_at: number | null }>(
    "SELECT salt, bits, expires_at, used_at FROM proof_challenges WHERE id = ?",
    answer.id
  )
  if (!row || row.used_at !== null || row.expires_at < now) return false
  // Synchronous from here to the end of the check, so two answers cannot both spend the same puzzle.
  run("UPDATE proof_challenges SET used_at = ? WHERE id = ?", now, answer.id)
  const digest = createHash("sha256").update(puzzleInput(row.salt, answer.nonce)).digest("hex")
  return meetsDifficulty(digest, row.bits)
}

async function verifyTurnstile(token: string): Promise<boolean> {
  const secret = process.env.RHENKO_TURNSTILE_SECRET_KEY?.trim()
  if (!secret) return false
  const url = process.env.RHENKO_TURNSTILE_VERIFY_URL?.trim() || TURNSTILE_VERIFY
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) return false
    return turnstileAccepted(await response.json())
  } catch (error) {
    // The secret and the token are never logged; the error name is enough to see what failed.
    console.error("[proof] the Turnstile check could not be completed", error instanceof Error ? error.name : "error")
    return false
  }
}

// A form's start time, signed. Sent back with the form as a hidden field.
export function formStamp(now = Date.now()): string {
  const time = String(now)
  return `${time}.${keyedHash("form", time)}`
}

// True when the stamp was made by this server and the form took a person's time to fill in.
export function stampOk(stamp: unknown, now = Date.now()): boolean {
  const parts = parseStamp(stamp)
  if (!parts) return false
  const expected = Buffer.from(keyedHash("form", parts.time))
  const given = Buffer.from(parts.signature)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false
  return formTimeOk(Number(parts.time), now)
}
