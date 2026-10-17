import { createHash } from "node:crypto"
import { get } from "@/lib/db"
import { normalizeForDuplicates, type AbuseFacts } from "@/lib/abuse-rules"

// The facts the spam checks read from the database. Pure scoring lives in lib/abuse-rules.ts; this file only counts.
// Every count leaves out the post being checked, and only counts posts that went live (not drafts or scheduled posts).

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const REPORT_WINDOW = 30 * DAY

// A fingerprint of a post's words. Two posts with the same words share it, whatever their links or punctuation. Null for
// text too short to compare (see normalizeForDuplicates).
export function textHash(body: string): string | null {
  const normalized = normalizeForDuplicates(body)
  return normalized ? createHash("sha256").update(normalized).digest("hex").slice(0, 32) : null
}

export async function factsFor(postId: string, authorId: string, hash: string | null, now = Date.now()): Promise<AbuseFacts> {
  const account = await get<{ created_at: number }>("SELECT created_at FROM users WHERE id = ?", authorId)
  const recent = await get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM posts
     WHERE author_id = ? AND id <> ? AND is_draft = 0 AND publish_at IS NULL AND created_at >= ?`,
    authorId,
    postId,
    now - 10 * MINUTE
  )
  const same = hash
    ? await get<{ n: number }>(
        `SELECT COUNT(*) AS n FROM posts
         WHERE author_id = ? AND id <> ? AND text_hash = ? AND is_draft = 0 AND publish_at IS NULL AND created_at >= ?`,
        authorId,
        postId,
        hash,
        now - DAY
      )
    : undefined
  const others = hash
    ? await get<{ n: number }>(
        `SELECT COUNT(DISTINCT author_id) AS n FROM posts
         WHERE text_hash = ? AND author_id <> ? AND id <> ? AND is_draft = 0 AND publish_at IS NULL AND created_at >= ?`,
        hash,
        authorId,
        postId,
        now - HOUR
      )
    : undefined
  // A notice the author got for spam that was later reversed does not count against them.
  const notices = await get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM moderation_notices WHERE user_id = ? AND category = 'spam' AND restored_at IS NULL",
    authorId
  )
  // Reports from accounts less than a week old do not count. A crowd of new accounts is how a post gets reported away.
  const reports = await get<{ n: number }>(
    `SELECT COUNT(DISTINCT r.reporter_id) AS n FROM reports r
     JOIN users u ON u.id = r.reporter_id
     WHERE r.created_at >= ? AND u.created_at <= ? AND (r.user_id = ? OR r.post_id IN (SELECT id FROM posts WHERE author_id = ?))`,
    now - REPORT_WINDOW,
    now - 7 * DAY,
    authorId,
    authorId
  )
  return {
    accountAgeHours: account ? Math.max(0, (now - account.created_at) / HOUR) : Number.MAX_SAFE_INTEGER,
    recentPosts: recent?.n ?? 0,
    sameTextBySelf: same?.n ?? 0,
    sameTextOthers: others?.n ?? 0,
    spamNotices: notices?.n ?? 0,
    reports: reports?.n ?? 0,
  }
}
