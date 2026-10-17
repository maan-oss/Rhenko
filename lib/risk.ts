// Account checks that need the database: what an account has been doing, where it was made from, and the gate that
// following, starting a conversation and posting pass through. The scoring is in lib/account-risk.ts.
//
// Where an account was made or signed in from is kept only as keyed hashes (lib/secrets.ts), never the address or the
// browser string. Those rows are removed after RETENTION.signalsDays.
import { get, run } from "@/lib/db"
import { clientIp } from "@/lib/auth"
import { assessAccount, type AccountFacts, type AccountVerdict } from "@/lib/account-risk"
import { networkHash, verifyProof } from "@/lib/proof"
import { parseAnswer } from "@/lib/proof-rules"

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY
const MONTH = 30 * DAY
// A passed check lets the account do what it asked for this long, so one puzzle covers a short run of follows or posts.
const PROOF_WINDOW = 2 * HOUR

export type SignalKind = "signup" | "login" | "proof"

// Notes where an account was made, signed in from, or passed a check. The network is a keyed hash. The browser's string is
// not kept: many people share one, so it says nothing about a single account.
export async function recordSignal(userId: string, kind: SignalKind, now = Date.now()): Promise<void> {
  await run("INSERT INTO account_signals (user_id, kind, ip_hash, created_at) VALUES (?, ?, ?, ?)", userId, kind, networkHash(await clientIp()), now)
}

async function count(sql: string, ...params: (string | number | null)[]): Promise<number> {
  return (await get<{ n: number }>(sql, ...params))?.n ?? 0
}

// What the account has done, as the scorer reads it. Null when the account does not exist.
export async function accountFacts(userId: string, now = Date.now()): Promise<AccountFacts | null> {
  const user = await get<{
    handle: string
    created_at: number
    email_verified_at: number | null
    bio: string
    avatar_file: string | null
    bot: number
  }>("SELECT handle, created_at, email_verified_at, bio, avatar_file, bot FROM users WHERE id = ?", userId)
  if (!user) return null
  const signup = await get<{ ip_hash: string | null }>(
    "SELECT ip_hash FROM account_signals WHERE user_id = ? AND kind = 'signup' ORDER BY created_at LIMIT 1",
    userId
  )
  // An address that is not known (no proxy header) is never counted, so a development server does not see one network.
  const sameNetwork = signup?.ip_hash
    ? await count(
        "SELECT COUNT(DISTINCT user_id) AS n FROM account_signals WHERE kind = 'signup' AND ip_hash = ? AND user_id <> ? AND created_at >= ?",
        signup.ip_hash,
        userId,
        now - WEEK
      )
    : 0
  return {
    accountAgeHours: Math.max(0, (now - user.created_at) / HOUR),
    emailVerified: user.email_verified_at !== null,
    emptyProfile: user.bio.trim() === "" && user.avatar_file === null,
    trailingDigits: /\d*$/.exec(user.handle)?.[0].length ?? 0,
    sameNetworkAccounts: sameNetwork,
    followsLastHour: await count("SELECT COUNT(*) AS n FROM follows WHERE follower_id = ? AND created_at >= ?", userId, now - HOUR),
    followsLastDay: await count("SELECT COUNT(*) AS n FROM follows WHERE follower_id = ? AND created_at >= ?", userId, now - DAY),
    likesLastHour: await count("SELECT COUNT(*) AS n FROM likes WHERE user_id = ? AND created_at >= ?", userId, now - HOUR),
    repostsLastHour: await count("SELECT COUNT(*) AS n FROM reposts WHERE user_id = ? AND created_at >= ?", userId, now - HOUR),
    newChatsLastHour: await count(
      "SELECT COUNT(*) AS n FROM conversations WHERE created_by = ? AND kind = 'dm' AND created_at >= ?",
      userId,
      now - HOUR
    ),
    reporters30Days: await count(
      `SELECT COUNT(DISTINCT r.reporter_id) AS n FROM reports r
       JOIN users u ON u.id = r.reporter_id
       WHERE r.created_at >= ? AND u.created_at <= ? AND r.reporter_id <> ? AND (r.user_id = ? OR r.post_id IN (SELECT id FROM posts WHERE author_id = ?))`,
      now - MONTH,
      now - WEEK,
      userId,
      userId,
      userId
    ),
    spamNotices: await count(
      "SELECT COUNT(*) AS n FROM moderation_notices WHERE user_id = ? AND category = 'spam' AND restored_at IS NULL",
      userId
    ),
    isBot: user.bot === 1,
  }
}

export async function accountVerdict(userId: string, now = Date.now()): Promise<AccountVerdict> {
  const facts = await accountFacts(userId, now)
  return facts ? assessAccount(facts) : { score: 0, level: "ok", reasons: [] }
}

// Whether an account has passed a check in the last few hours.
async function provedRecently(userId: string, now: number): Promise<boolean> {
  return await count("SELECT COUNT(*) AS n FROM account_signals WHERE user_id = ? AND kind = 'proof' AND created_at >= ?", userId, now - PROOF_WINDOW) > 0
}

// proofRequired is true when the same action will pass once a human check is sent with it.
export type GateResult = { ok: true } | { ok: false; error: string; proofRequired: boolean }

export const CHECK_MESSAGE = "Confirm you're a person to continue."
export const RESTRICTED_MESSAGE =
  "Your account is limited for now because of unusual activity. Confirm your email address in Settings, or try again later."

// The gate for following, starting a conversation and posting. Ordinary accounts pass. A challenged account must pass a
// human check (a proof sent with the action). A restricted account is refused until its activity settles.
export async function gate(userId: string, proof: unknown, now = Date.now()): Promise<GateResult> {
  const verdict = await accountVerdict(userId, now)
  if (verdict.level === "ok") return { ok: true }
  if (verdict.level === "restrict") return { ok: false, error: RESTRICTED_MESSAGE, proofRequired: false }
  if (await provedRecently(userId, now)) return { ok: true }
  const answer = parseAnswer(proof)
  if (answer && (await verifyProof(answer, now))) {
    await recordSignal(userId, "proof", now)
    return { ok: true }
  }
  return { ok: false, error: CHECK_MESSAGE, proofRequired: true }
}

// An account made in the last week. New accounts get smaller limits on following and starting conversations.
export async function isNewAccount(userId: string, now = Date.now()): Promise<boolean> {
  return await count("SELECT COUNT(*) AS n FROM users WHERE id = ? AND created_at >= ?", userId, now - WEEK) > 0
}
