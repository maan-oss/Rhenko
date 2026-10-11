import { createHash, randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from "node:crypto"
import { cookies, headers } from "next/headers"
import { connection } from "next/server"
import { redirect } from "next/navigation"
import { get, run } from "@/lib/db"

export const SESSION_COOKIE = "rhenko_session"
export const CHALLENGE_COOKIE = "rhenko_challenge"
const ACCOUNTS_COOKIE = "rhenko_accounts"
const MAX_ACCOUNTS = 5
const SESSION_MS = 30 * 24 * 60 * 60 * 1000
const CHALLENGE_MS = 5 * 60 * 1000
const LAST_SEEN_EVERY_MS = 10 * 60 * 1000

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
  protected: number
  totp_enabled: number
  totp_secret: string | null
  totp_step: number
  deactivated_at: number | null
  birthday: string | null
  status: string
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
  }
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

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

export function findUserByHandleWithSecret(handle: string): UserRow | undefined {
  return get<UserRow>("SELECT * FROM users WHERE handle = ? COLLATE NOCASE", handle)
}

export function findUserById(id: string): UserRow | undefined {
  return get<UserRow>("SELECT * FROM users WHERE id = ?", id)
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
  run(
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

export async function currentSessionHash(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  return token ? hashToken(token) : null
}

export async function destroySession(): Promise<void> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (token) run("DELETE FROM sessions WHERE token_hash = ?", hashToken(token))
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
    const row = get<{ id: string; handle: string; name: string; avatar_file: string | null }>(
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
    const row = get<{ user_id: string }>(
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
  return next ? activateAccount(next.id) : false
}

// Two-step sign-in: a short-lived challenge stands in for the session until
// the second factor is accepted.
export async function createChallenge(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url")
  const now = Date.now()
  run("DELETE FROM login_challenges WHERE expires_at < ?", now)
  run(
    "INSERT INTO login_challenges (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
    hashToken(token),
    userId,
    now,
    now + CHALLENGE_MS
  )
  ;(await cookies()).set(CHALLENGE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CHALLENGE_MS / 1000,
  })
}

export async function challengedUserId(): Promise<string | null> {
  await connection()
  const token = (await cookies()).get(CHALLENGE_COOKIE)?.value
  if (!token) return null
  const row = get<{ user_id: string }>(
    "SELECT user_id FROM login_challenges WHERE token_hash = ? AND expires_at > ?",
    hashToken(token),
    Date.now()
  )
  return row?.user_id ?? null
}

export async function clearChallenge(): Promise<void> {
  const store = await cookies()
  const token = store.get(CHALLENGE_COOKIE)?.value
  if (token) run("DELETE FROM login_challenges WHERE token_hash = ?", hashToken(token))
  store.delete(CHALLENGE_COOKIE)
}

export async function getViewer(): Promise<Viewer | null> {
  await connection()
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token) return null
  const hash = hashToken(token)
  const now = Date.now()
  const row = get<UserRow & { last_seen: number }>(
    `SELECT u.*, s.last_seen FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ? AND u.deactivated_at IS NULL`,
    hash,
    now
  )
  if (!row) return null
  if (now - row.last_seen > LAST_SEEN_EVERY_MS) {
    run("UPDATE sessions SET last_seen = ? WHERE token_hash = ?", now, hash)
  }
  return toViewer(row)
}

export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer()
  if (!viewer) redirect("/login")
  return viewer
}

export function newId(): string {
  return randomUUID()
}
