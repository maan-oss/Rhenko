import { createHash, randomBytes, randomInt, randomUUID, scrypt as scryptCb, timingSafeEqual } from "node:crypto"
import { cookies, headers } from "next/headers"
import { connection } from "next/server"
import { redirect } from "next/navigation"
import { change, get, run, transaction, type Param } from "@/lib/db"
import { TERMS_VERSION } from "@/lib/legal"
import { consume } from "@/lib/rate-limit"
import { decryptText, encryptText, isEncrypted, keyedHash } from "@/lib/secrets"
import {
  hashRecoveryCode,
  isBase32Secret,
  legacyRecoveryHash,
  matchTotp,
  normalizeAppCode,
  normalizeRecoveryCode,
} from "@/lib/totp"

export const SESSION_COOKIE = "rhenko_session"
export const CHALLENGE_COOKIE = "rhenko_challenge"
const ACCOUNTS_COOKIE = "rhenko_accounts"
const MAX_ACCOUNTS = 5
const SESSION_MS = 30 * 24 * 60 * 60 * 1000
const CHALLENGE_MS = 5 * 60 * 1000
const LAST_SEEN_EVERY_MS = 10 * 60 * 1000
// Wrong codes one sign-in may take before it has to start again from the password.
export const CHALLENGE_TRIES = 5
// Email codes work for 15 minutes and survive four wrong tries; the fifth wrong one deletes the code.
export const EMAIL_CODE_MS = 15 * 60 * 1000
export const EMAIL_CODE_TRIES = 5

export type UserRow = {
  id: string
  handle: string
  name: string
  bio: string
  location: string
  website: string
  avatar_file: string | null
  banner_file: string | null
  password_hash: string
  created_at: number
  verified: number
  paid_verified: number
  plus_active?: number
  protected: number
  totp_enabled: number
  totp_secret: string | null
  totp_step: number
  deactivated_at: number | null
  birthday: string | null
  status: string
  email: string | null
  email_verified_at: number | null
  terms_version: string | null
  onboarding: string
  // The language codes this account speaks, joined with commas. Read only by getViewer.
  speaks_codes?: string | null
}

export type Viewer = {
  id: string
  handle: string
  name: string
  bio: string
  location: string
  website: string
  avatarFile: string | null
  bannerFile: string | null
  createdAt: number
  verified: boolean
  protected: boolean
  totpEnabled: boolean
  status: string
  // The Terms version this account accepted last. The app asks again when the current version differs.
  termsVersion: string | null
  // The address on the account, and whether it has been confirmed. Paid verification needs a confirmed address.
  email: string | null
  emailVerified: boolean
  // Plus: an active paid subscription. It removes ads and extends the edit window. Nothing else about reach changes.
  plus: boolean
  // A paid subscriber badge. It is shown to others, and says nothing about who the person is.
  paidVerified: boolean
  // Setting up connections: pending until the person finishes or skips the steps after sign-up.
  onboarding: "pending" | "done" | "skipped"
  // The languages this account speaks. Used to tell whether a post or message is in one the viewer can read.
  speaks: string[]
}

export function toViewer(row: UserRow): Viewer {
  return {
    id: row.id,
    handle: row.handle,
    name: row.name,
    bio: row.bio,
    location: row.location,
    website: row.website,
    avatarFile: row.avatar_file,
    bannerFile: row.banner_file,
    createdAt: row.created_at,
    verified: row.verified === 1,
    protected: row.protected === 1,
    totpEnabled: row.totp_enabled === 1,
    status: row.status,
    termsVersion: row.terms_version,
    email: row.email,
    emailVerified: row.email_verified_at !== null,
    plus: row.plus_active === 1,
    paidVerified: row.paid_verified === 1,
    onboarding: row.onboarding === "pending" || row.onboarding === "done" ? row.onboarding : "skipped",
    speaks: row.speaks_codes ? row.speaks_codes.split(",") : [],
  }
}

// Runs a write and returns how many rows it changed, for updates that only count when they apply.
export async function runChanges(sql: string, ...params: Param[]): Promise<number> {
  return await change(sql, ...params)
}

// True when a write broke a unique index, such as "users.email" or "users.handle".
// The unique index behind each column the app reports on. Postgres names them in the schema.
const UNIQUE_INDEXES: Record<string, string> = { "users.email": "users_email", "users.handle": "users_handle_key" }

export function isUniqueViolation(error: unknown, column: string): boolean {
  if (typeof error !== "object" || error === null) return false
  const pg = error as { code?: string; constraint_name?: string }
  return pg.code === "23505" && pg.constraint_name === UNIQUE_INDEXES[column]
}

function scrypt(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, 64, (error, key) => (error ? reject(error) : resolve(key)))
  })
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await scrypt(password, salt)
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltB64, keyB64] = stored.split("$")
  if (scheme !== "scrypt" || !saltB64 || !keyB64) return false
  const expected = Buffer.from(keyB64, "base64")
  const actual = await scrypt(password, Buffer.from(saltB64, "base64"))
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

// A throwaway hash, made once when the server loads this module, so it is ready before the first sign-in.
const dummyHash: Promise<string> = hashPassword(randomBytes(18).toString("base64"))

// A sign-in for a handle that doesn't exist still runs one password check against the throwaway hash, so the time a
// failed sign-in takes doesn't reveal which handles exist.
export async function spendPasswordCheck(password: string): Promise<void> {
  await verifyPassword(password, await dummyHash)
}

// The address a request came from, for rate limits. Headers are believed only when RHENKO_TRUST_PROXY=1 says a proxy in
// front of the app sets them. Without that setting every visitor counts as one address: the limits are tighter, but a
// visitor cannot send a header to get a fresh allowance. Behind one proxy the address is X-Real-IP when the proxy sets
// it, otherwise the last X-Forwarded-For entry, which is the one the proxy itself saw.
export async function clientIp(): Promise<string> {
  if (process.env.RHENKO_TRUST_PROXY !== "1") return "local"
  const list = await headers()
  const real = list.get("x-real-ip")?.trim()
  if (real) return real.slice(0, 100)
  const forwarded = list.get("x-forwarded-for")?.split(",").map((part) => part.trim()).filter(Boolean).pop()
  if (forwarded) return forwarded.slice(0, 100)
  return "local"
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

export async function findUserByHandleWithSecret(handle: string): Promise<UserRow | undefined> {
  return await get<UserRow>("SELECT * FROM users WHERE handle = ?", handle)
}

export async function findUserById(id: string): Promise<UserRow | undefined> {
  return await get<UserRow>("SELECT * FROM users WHERE id = ?", id)
}

async function userAgent(): Promise<string> {
  return ((await headers()).get("user-agent") ?? "").slice(0, 200)
}

type CookieStore = Awaited<ReturnType<typeof cookies>>

function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MS / 1000,
  }
}

// Every session token this browser has signed in with. Each one is a live session,
// so switching accounts is a single cookie write. Kept httpOnly, like the session itself.
function storedTokens(store: CookieStore): string[] {
  const raw = store.get(ACCOUNTS_COOKIE)?.value
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((token): token is string => typeof token === "string" && token.length > 0).slice(-MAX_ACCOUNTS)
  } catch {
    return []
  }
}

function saveTokens(store: CookieStore, tokens: string[]): void {
  store.set(ACCOUNTS_COOKIE, JSON.stringify(tokens.slice(-MAX_ACCOUNTS)), sessionCookieOptions())
}

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url")
  const now = Date.now()
  await run(
    "INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent, last_seen) VALUES (?, ?, ?, ?, ?, ?)",
    hashToken(token),
    userId,
    now,
    now + SESSION_MS,
    await userAgent(),
    now
  )
  const store = await cookies()
  store.set(SESSION_COOKIE, token, sessionCookieOptions())
  saveTokens(store, [...storedTokens(store).filter((known) => known !== token), token])
}

// True while a session token still names a live account. Long-lived streams check this to close once a session ends.
export async function sessionTokenValid(token: string): Promise<boolean> {
  const row = await get<{ user_id: string }>(
    `SELECT s.user_id FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ? AND u.deactivated_at IS NULL`,
    hashToken(token),
    Date.now()
  )
  return row !== undefined
}

export async function currentSessionHash(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  return token ? hashToken(token) : null
}

export async function destroySession(): Promise<void> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (token) {
    await run("DELETE FROM sessions WHERE token_hash = ?", hashToken(token))
    viewerCache.delete(hashToken(token))
  }
  store.delete(SESSION_COOKIE)
  if (token) saveTokens(store, storedTokens(store).filter((known) => known !== token))
}

export type AccountSummary = {
  id: string
  handle: string
  name: string
  avatarFile: string | null
  active: boolean
}

// The accounts signed in on this browser that are still valid, with the active one marked.
export async function listAccounts(): Promise<AccountSummary[]> {
  const store = await cookies()
  const current = store.get(SESSION_COOKIE)?.value ?? null
  const tokens = storedTokens(store)
  if (current && !tokens.includes(current)) tokens.push(current)
  const now = Date.now()
  const seen = new Set<string>()
  const accounts: AccountSummary[] = []
  for (const token of tokens) {
    const row = await get<{ id: string; handle: string; name: string; avatar_file: string | null }>(
      `SELECT u.id, u.handle, u.name, u.avatar_file FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ? AND u.deactivated_at IS NULL`,
      hashToken(token),
      now
    )
    if (!row || seen.has(row.id)) continue
    seen.add(row.id)
    accounts.push({ id: row.id, handle: row.handle, name: row.name, avatarFile: row.avatar_file, active: token === current })
  }
  return accounts
}

// Makes one of the remembered accounts the active one. Returns false if it is no longer signed in here.
export async function activateAccount(userId: string): Promise<boolean> {
  const store = await cookies()
  for (const token of storedTokens(store)) {
    const row = await get<{ user_id: string }>(
      `SELECT s.user_id FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ? AND u.deactivated_at IS NULL`,
      hashToken(token),
      Date.now()
    )
    if (row?.user_id === userId) {
      store.set(SESSION_COOKIE, token, sessionCookieOptions())
      return true
    }
  }
  return false
}

// After logging out, the next remembered account takes over if there is one.
export async function adoptRemainingAccount(): Promise<boolean> {
  const next = (await listAccounts())[0]
  return next ? await activateAccount(next.id) : false
}

// Two-step sign-in: a short-lived challenge stands in for the session until
// the second factor is accepted.
export async function createChallenge(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url")
  const now = Date.now()
  const store = await cookies()
  const previous = store.get(CHALLENGE_COOKIE)?.value
  if (previous) await run("DELETE FROM login_challenges WHERE token_hash = ?", hashToken(previous))
  await run("DELETE FROM login_challenges WHERE expires_at < ?", now)
  await run(
    "INSERT INTO login_challenges (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
    hashToken(token),
    userId,
    now,
    now + CHALLENGE_MS
  )
  store.set(CHALLENGE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CHALLENGE_MS / 1000,
  })
}

// The sign-in waiting for its second step on this browser, if there is one that hasn't expired.
export async function readChallenge(): Promise<{ userId: string; tokenHash: string } | null> {
  await connection()
  const token = (await cookies()).get(CHALLENGE_COOKIE)?.value
  if (!token) return null
  const tokenHash = hashToken(token)
  const row = await get<{ user_id: string }>(
    "SELECT user_id FROM login_challenges WHERE token_hash = ? AND expires_at > ?",
    tokenHash,
    Date.now()
  )
  return row ? { userId: row.user_id, tokenHash } : null
}

// Counts a wrong code against one sign-in. Returns false on the fifth wrong code, when the sign-in has to start
// again. consume() allows `limit` calls in its window and refuses the next, so a limit of four refuses the fifth.
export async function countChallengeFailure(tokenHash: string): Promise<boolean> {
  return (await consume(`2fa:${tokenHash}`, CHALLENGE_TRIES - 1, CHALLENGE_MS)).ok
}

export async function clearChallenge(): Promise<void> {
  const store = await cookies()
  const token = store.get(CHALLENGE_COOKIE)?.value
  if (token) await run("DELETE FROM login_challenges WHERE token_hash = ?", hashToken(token))
  store.delete(CHALLENGE_COOKIE)
}

// Two-factor secrets are stored encrypted. A value saved before that is plain base32: it still works and is
// encrypted after the next code that checks out. A value this server's key can't open is unreadable, and only
// recovery codes work for that account until two-factor sign-in is set up again.
type OpenedSecret = { kind: "none" } | { kind: "unreadable" } | { kind: "ok"; secret: string; legacy: boolean }

function openSecret(stored: string | null): OpenedSecret {
  if (!stored) return { kind: "none" }
  if (isEncrypted(stored)) {
    const secret = decryptText(stored)
    return secret ? { kind: "ok", secret, legacy: false } : { kind: "unreadable" }
  }
  return isBase32Secret(stored) ? { kind: "ok", secret: stored, legacy: true } : { kind: "unreadable" }
}

// The authenticator secret in plain form, for setup. Null when there is none or it can't be read.
export function readTotpSecret(stored: string | null): string | null {
  const opened = openSecret(stored)
  return opened.kind === "ok" ? opened.secret : null
}

// Saves an encrypted copy of a secret that was still stored in plain form, unless it changed in the meantime.
async function encryptLegacySecret(userId: string, stored: string | null): Promise<void> {
  const opened = openSecret(stored)
  if (opened.kind !== "ok" || !opened.legacy) return
  await run("UPDATE users SET totp_secret = ? WHERE id = ? AND totp_secret = ?", encryptText(opened.secret), userId, stored)
}

export type SecondFactorState = {
  enabled: boolean
  // Whether this server can read the authenticator key, so app codes can be checked.
  usable: boolean
  recoveryLeft: number
}

export async function recoveryCodesLeft(userId: string): Promise<number> {
  return (await get<{ c: number }>("SELECT COUNT(*) AS c FROM recovery_codes WHERE user_id = ? AND used_at IS NULL", userId))?.c ?? 0
}

export async function secondFactorState(userId: string): Promise<SecondFactorState> {
  const row = await get<{ totp_enabled: number; totp_secret: string | null }>(
    "SELECT totp_enabled, totp_secret FROM users WHERE id = ?",
    userId
  )
  if (!row || row.totp_enabled !== 1) return { enabled: false, usable: false, recoveryLeft: 0 }
  return { enabled: true, usable: openSecret(row.totp_secret).kind === "ok", recoveryLeft: await recoveryCodesLeft(userId) }
}

// Replaces every recovery code with new hashes. Call inside a transaction.
export async function replaceRecoveryCodes(userId: string, hashes: string[]): Promise<void> {
  await run("DELETE FROM recovery_codes WHERE user_id = ?", userId)
  for (const hash of hashes) {
    await run("INSERT INTO recovery_codes (id, user_id, code_hash) VALUES (?, ?, ?)", newId(), userId, hash)
  }
}

// Uses up one recovery code inside a transaction, so it works once. Codes stored as plain SHA-256, from before
// keyed hashes, still work and are deleted when used.
async function redeemRecoveryCode(userId: string, code: string): Promise<boolean> {
  const keyed = hashRecoveryCode(code)
  const legacy = legacyRecoveryHash(code)
  return await transaction(async () => {
    const row = await get<{ id: string; code_hash: string }>(
      "SELECT id, code_hash FROM recovery_codes WHERE user_id = ? AND used_at IS NULL AND code_hash IN (?, ?) LIMIT 1",
      userId,
      keyed,
      legacy
    )
    if (!row) return false
    if (row.code_hash === legacy) return await runChanges("DELETE FROM recovery_codes WHERE id = ?", row.id) === 1
    return await runChanges("UPDATE recovery_codes SET used_at = ? WHERE id = ? AND used_at IS NULL", Date.now(), row.id) === 1
  })
}

export type CodeCheck = { ok: true; used: "app" | "recovery" } | { ok: false; error: string }

// Checks a code from the authenticator app, or a recovery code, for an account with two-factor sign-in on.
// An app code counts once: its time step is saved with a conditional update, and only a changed row is a success,
// so a replayed code fails even when two requests race.
export async function checkSecondFactor(userId: string, input: string): Promise<CodeCheck> {
  const row = await get<{ totp_enabled: number; totp_secret: string | null; totp_step: number }>(
    "SELECT totp_enabled, totp_secret, totp_step FROM users WHERE id = ?",
    userId
  )
  if (!row || row.totp_enabled !== 1) return { ok: false, error: "Two-factor sign-in is off for this account." }

  const appCode = normalizeAppCode(input)
  if (appCode) {
    const opened = openSecret(row.totp_secret)
    if (opened.kind !== "ok") {
      return { ok: false, error: "Codes from your authenticator app can't be checked right now. Enter a recovery code instead." }
    }
    const step = matchTotp(opened.secret, appCode, row.totp_step)
    if (step === null) {
      if (matchTotp(opened.secret, appCode, -1) !== null) {
        return { ok: false, error: "That code was already used. Wait for the next one in your app." }
      }
      return { ok: false, error: "That code isn't right. Codes change every 30 seconds, so enter the one showing now." }
    }
    const saved = await transaction(async () => {
      if (await runChanges("UPDATE users SET totp_step = ? WHERE id = ? AND totp_enabled = 1 AND totp_step < ?", step, userId, step) !== 1) {
        return false
      }
      await encryptLegacySecret(userId, row.totp_secret)
      return true
    })
    if (!saved) return { ok: false, error: "That code was already used. Wait for the next one in your app." }
    return { ok: true, used: "app" }
  }

  const recovery = normalizeRecoveryCode(input)
  if (recovery) {
    if (!await redeemRecoveryCode(userId, recovery)) {
      return { ok: false, error: "That recovery code isn't valid, or it was already used." }
    }
    await encryptLegacySecret(userId, row.totp_secret)
    return { ok: true, used: "recovery" }
  }

  return { ok: false, error: "Enter the 6-digit code from your authenticator app, or a recovery code like abcd-efgh." }
}

// Email codes, for verifying an address and for resetting a password. Six digits, stored only as a keyed hash
// bound to the account, the purpose and the address it was sent to.
export type EmailPurpose = "verify" | "reset"

function emailCodeHash(purpose: EmailPurpose, userId: string, target: string, code: string): string {
  return keyedHash(`email-${purpose}`, `${userId}:${target.toLowerCase()}:${code}`)
}

// A new code for one purpose, replacing any earlier one. Returns the code to send.
export async function issueEmailCode(userId: string, purpose: EmailPurpose, target: string, now = Date.now()): Promise<string> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0")
  await transaction(async () => {
    await run("DELETE FROM email_codes WHERE user_id = ? AND purpose = ?", userId, purpose)
    await run(
      `INSERT INTO email_codes (id, user_id, purpose, target, code_hash, attempts, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
      newId(),
      userId,
      purpose,
      target,
      emailCodeHash(purpose, userId, target, code),
      now + EMAIL_CODE_MS,
      now
    )
  })
  return code
}

// Removes the codes for one purpose: when a code couldn't be sent, or the person changed their mind.
export async function withdrawEmailCodes(userId: string, purpose: EmailPurpose): Promise<void> {
  await run("DELETE FROM email_codes WHERE user_id = ? AND purpose = ?", userId, purpose)
}

export async function pendingEmailCode(userId: string, purpose: EmailPurpose, now = Date.now()): Promise<{ target: string; expiresAt: number } | null> {
  const row = await get<{ target: string; expires_at: number }>(
    "SELECT target, expires_at FROM email_codes WHERE user_id = ? AND purpose = ? AND expires_at > ? ORDER BY created_at DESC LIMIT 1",
    userId,
    purpose,
    now
  )
  return row ? { target: row.target, expiresAt: row.expires_at } : null
}

export type RedeemResult<T> = { ok: true; value: T } | { ok: false; reason: "missing" | "wrong" | "spent"; triesLeft: number }

// Checks an email code. A right code is deleted and `apply` runs in the same transaction, so a code works once and
// nothing is used up when `apply` throws. A wrong code costs one of its five tries; the fifth deletes it.
export async function redeemEmailCode<T>(
  userId: string,
  purpose: EmailPurpose,
  input: string,
  apply: (target: string) => T | Promise<T>,
  now = Date.now()
): Promise<RedeemResult<T>> {
  const typed = input.replace(/\s+/g, "")
  return await transaction(async (): Promise<RedeemResult<T>> => {
    const row = await get<{ id: string; target: string; code_hash: string; attempts: number }>(
      `SELECT id, target, code_hash, attempts FROM email_codes
       WHERE user_id = ? AND purpose = ? AND expires_at > ? ORDER BY created_at DESC LIMIT 1`,
      userId,
      purpose,
      now
    )
    if (!row) return { ok: false, reason: "missing", triesLeft: 0 }
    if (row.attempts >= EMAIL_CODE_TRIES) {
      await run("DELETE FROM email_codes WHERE id = ?", row.id)
      return { ok: false, reason: "spent", triesLeft: 0 }
    }
    const expected = Buffer.from(row.code_hash, "hex")
    const actual = Buffer.from(emailCodeHash(purpose, userId, row.target, /^\d{6}$/.test(typed) ? typed : "-"), "hex")
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      const attempts = row.attempts + 1
      if (attempts >= EMAIL_CODE_TRIES) {
        await run("DELETE FROM email_codes WHERE id = ?", row.id)
        return { ok: false, reason: "spent", triesLeft: 0 }
      }
      await run("UPDATE email_codes SET attempts = ? WHERE id = ?", attempts, row.id)
      return { ok: false, reason: "wrong", triesLeft: EMAIL_CODE_TRIES - attempts }
    }
    await run("DELETE FROM email_codes WHERE id = ?", row.id)
    return { ok: true, value: await apply(row.target) }
  })
}

// The viewer of a session, remembered for a few seconds. A page makes several requests in quick succession, and each one
// used to look the session up again. A profile change shows once the window closes. Signing out clears the entry on the
// server that handled it, and the other servers drop it within the window.
const VIEWER_TTL_MS = 10_000
const VIEWER_CACHE_MAX = 20_000
const viewerCache = new Map<string, { viewer: Viewer; until: number }>()

export async function getViewer(): Promise<Viewer | null> {
  await connection()
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token) return null
  const hash = hashToken(token)
  const now = Date.now()
  const cached = viewerCache.get(hash)
  if (cached && cached.until > now) return cached.viewer
  const row = await get<UserRow & { last_seen: number }>(
    `SELECT u.*, s.last_seen,
       EXISTS(SELECT 1 FROM subscriptions sub WHERE sub.user_id = u.id AND sub.kind = 'plus' AND sub.status IN ('active', 'trialing')) AS plus_active,
       (SELECT string_agg(ul.code, ',') FROM user_languages ul WHERE ul.user_id = u.id AND ul.kind = 'speak') AS speaks_codes
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ? AND u.deactivated_at IS NULL`,
    hash,
    now
  )
  if (!row) {
    viewerCache.delete(hash)
    return null
  }
  if (now - row.last_seen > LAST_SEEN_EVERY_MS) {
    await run("UPDATE sessions SET last_seen = ? WHERE token_hash = ?", now, hash)
  }
  const viewer = toViewer(row)
  if (viewerCache.size >= VIEWER_CACHE_MAX) viewerCache.clear()
  viewerCache.set(hash, { viewer, until: now + VIEWER_TTL_MS })
  return viewer
}

export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer()
  if (!viewer) redirect("/login")
  return viewer
}

// The viewer an action may act for: signed in, and agreed to the current Terms and Privacy Policy. The pages already send an
// account that has not agreed to the agreement screen; this does the same for a request sent straight to an action.
export async function getAgreedViewer(): Promise<Viewer | null> {
  const viewer = await getViewer()
  return viewer && viewer.termsVersion === TERMS_VERSION ? viewer : null
}

export async function requireAgreedViewer(): Promise<Viewer> {
  const viewer = await getViewer()
  if (!viewer) redirect("/login")
  if (viewer.termsVersion !== TERMS_VERSION) redirect("/accept-terms")
  return viewer
}

export function newId(): string {
  return randomUUID()
}
