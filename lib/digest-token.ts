// The signed link that turns one person's daily digest off without signing in. Kept apart from lib/digest-rules.ts because
// it needs node:crypto, and the settings page (a client component) imports that file. Pure apart from the crypto, so
// tests/digest.test.mjs can check it.
import { createHmac, timingSafeEqual } from "node:crypto"

const DAY_MS = 24 * 60 * 60 * 1000

// How long the link in a digest keeps working. Every digest carries a fresh one.
export const UNSUBSCRIBE_DAYS = 30

export type TokenCheck = { ok: true; userId: string } | { ok: false; reason: "invalid" | "expired" }

const TOKEN_PARTS = 4
const MAX_TOKEN = 300

function signatureOf(key: string, userId: string, expires: number): string {
  return createHmac("sha256", key).update(`digest-unsubscribe.v1.${userId}.${expires}`).digest("base64url")
}

// A signed token that turns one person's digest off until it expires. It is "v1", the account, the expiry in base 36 and an
// HMAC-SHA256 of the two, made with `key`. It cannot be used for anything else, and it holds nothing a reader could use.
export function signUnsubscribeToken(userId: string, key: string, now: number, days = UNSUBSCRIBE_DAYS): string {
  const expires = now + days * DAY_MS
  return ["v1", userId, expires.toString(36), signatureOf(key, userId, expires)].join(".")
}

// The account the token is for. A token that was not signed with `key`, or was changed, is "invalid"; one that was signed and
// has run out is "expired".
export function readUnsubscribeToken(token: unknown, key: string, now: number): TokenCheck {
  const invalid = { ok: false, reason: "invalid" } as const
  if (typeof token !== "string" || token.length > MAX_TOKEN) return invalid
  const parts = token.split(".")
  if (parts.length !== TOKEN_PARTS || parts[0] !== "v1") return invalid
  const [, userId, stamp, signature] = parts
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(userId) || !/^[0-9a-z]{1,12}$/.test(stamp)) return invalid
  const expires = parseInt(stamp, 36)
  const expected = Buffer.from(signatureOf(key, userId, expires))
  const given = Buffer.from(signature)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return invalid
  return expires > now ? { ok: true, userId } : { ok: false, reason: "expired" }
}
