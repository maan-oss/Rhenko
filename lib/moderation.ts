import { all, get, run, transaction } from "@/lib/db"
import { newId } from "@/lib/auth"
import { APPEAL_MS } from "@/lib/legal"
import { mediaFilesFor, removeFiles, thread } from "@/lib/post-writes"

// Hiding is how content leaves the feeds: the post and its replies stay on the server, marked, so the author can read
// the reason and appeal, and a moderator can put them back. A hidden post is gone for everyone else at once. When its
// appeal window closes without an appeal, or an appeal is decided against the author, the content is deleted for good.

export type HideInput = {
  postId: string
  category: string
  explanation: string
  // Where the decision came from: "moderator", "report:<id>" or "legal:<id>". The source tells a reversal which notice a
  // hidden post belongs to.
  source: string
}

export type HideResult = { ok: true; noticeId: string; authorId: string } | { ok: false; error: string }

const EXCERPT_CHARS = 140

export function excerptOf(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim()
  return [...flat].length > EXCERPT_CHARS ? `${[...flat].slice(0, EXCERPT_CHARS).join("")}…` : flat
}

// Hides a post with its replies and writes the notice its author will see. Hiding a post that is already hidden does nothing.
export function hidePost(input: HideInput, now = Date.now()): HideResult {
  const post = get<{ id: string; author_id: string; body: string; removed_at: number | null }>(
    "SELECT id, author_id, body, removed_at FROM posts WHERE id = ?",
    input.postId
  )
  if (!post) return { ok: false, error: "That post doesn't exist any more." }
  if (post.removed_at !== null) return { ok: false, error: "That post is already hidden." }
  const ids = thread(post.id)
  const noticeId = newId()
  transaction(() => {
    run(`UPDATE posts SET removed_at = ? WHERE id IN (${ids.map(() => "?").join(",")})`, now, ...ids)
    run(
      `INSERT INTO moderation_notices (id, user_id, post_id, category, explanation, excerpt, source, created_at, appeal_until)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      noticeId,
      post.author_id,
      post.id,
      input.category,
      input.explanation.trim(),
      excerptOf(post.body),
      input.source,
      now,
      now + APPEAL_MS
    )
  })
  return { ok: true, noticeId, authorId: post.author_id }
}

// Puts a hidden post and its replies back, the ones hidden at the same moment as the post. Used when an appeal succeeds
// or a notice is rejected.
export function restorePost(postId: string, now = Date.now()): boolean {
  const root = get<{ removed_at: number | null }>("SELECT removed_at FROM posts WHERE id = ?", postId)
  if (!root || root.removed_at === null) return false
  const ids = thread(postId)
  run(
    `UPDATE posts SET removed_at = NULL WHERE removed_at = ? AND id IN (${ids.map(() => "?").join(",")})`,
    root.removed_at,
    ...ids
  )
  run("UPDATE moderation_notices SET restored_at = ? WHERE post_id = ? AND restored_at IS NULL", now, postId)
  // A person has looked at the post and put it back, so the automatic limit or hold no longer applies to it.
  run(`UPDATE post_risk SET action = 'allow' WHERE post_id IN (${ids.map(() => "?").join(",")})`, ...ids)
  return true
}

export type AppealDecision = "reversed" | "upheld"

// Records the decision on an appeal. A reversal restores the post. Either way the notice is closed.
export function decideAppeal(appealId: string, decision: AppealDecision, note: string, now = Date.now()): { ok: true } | { ok: false; error: string } {
  const appeal = get<{ id: string; notice_id: string; decided_at: number | null }>(
    "SELECT id, notice_id, decided_at FROM appeals WHERE id = ?",
    appealId
  )
  if (!appeal) return { ok: false, error: "No appeal has that id." }
  if (appeal.decided_at !== null) return { ok: false, error: "That appeal was already decided." }
  const notice = get<{ post_id: string }>("SELECT post_id FROM moderation_notices WHERE id = ?", appeal.notice_id)
  transaction(() => {
    run("UPDATE appeals SET decided_at = ?, decision = ?, decision_note = ? WHERE id = ?", now, decision, note.trim(), appeal.id)
    if (decision === "reversed" && notice) restorePost(notice.post_id, now)
  })
  return { ok: true }
}

// Deletes hidden posts whose appeal window has closed with no appeal, or whose appeal was decided against the author.
// Their files go too, and the notice keeps its reason but loses the excerpt of the content.
export function purgeHidden(now = Date.now()): number {
  const due = all<{ notice_id: string; post_id: string }>(
    `SELECT n.id AS notice_id, n.post_id AS post_id FROM moderation_notices n
     JOIN posts p ON p.id = n.post_id
     LEFT JOIN appeals a ON a.notice_id = n.id
     WHERE n.restored_at IS NULL AND p.removed_at IS NOT NULL
       AND ((a.id IS NULL AND n.appeal_until < ?) OR (a.decision = 'upheld'))`,
    now
  )
  for (const item of due) {
    const ids = thread(item.post_id)
    const files = mediaFilesFor(ids)
    transaction(() => {
      run("DELETE FROM posts WHERE id = ?", item.post_id)
      run("UPDATE moderation_notices SET excerpt = '' WHERE id = ?", item.notice_id)
    })
    removeFiles(files)
  }
  return due.length
}
