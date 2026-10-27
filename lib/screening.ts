import { all, change, get, run, transaction } from "@/lib/db"
import { assessPost, type AbuseVerdict } from "@/lib/abuse-rules"
import { factsFor, textHash } from "@/lib/abuse"
import { hidePost } from "@/lib/moderation"
import { announcePost, startPollClock } from "@/lib/post-writes"

// Checks a live post and keeps the result. What happens next depends on the verdict:
//   allow: nothing changes.
//   limit: the post stays up, but it is kept out of other people's For you feeds and sends no notifications.
//   hold:  the post is hidden with a notice to its author, who can appeal it like any other moderation action.
// The check runs when a post goes live and again when a live post's text is edited.

type Stored = { id: string; author_id: string; body: string; removed_at: number | null }

export async function screenPost(postId: string, now = Date.now()): Promise<AbuseVerdict | null> {
  const post = await get<Stored>("SELECT id, author_id, body, removed_at FROM posts WHERE id = ?", postId)
  if (!post) return null
  const hash = textHash(post.body)
  const verdict = assessPost(post.body, await factsFor(post.id, post.author_id, hash, now))
  await transaction(async () => {
    await run("UPDATE posts SET text_hash = ? WHERE id = ?", hash, post.id)
    await run(
      `INSERT INTO post_risk (post_id, score, action, reasons, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(post_id) DO UPDATE SET score = excluded.score, action = excluded.action,
         reasons = excluded.reasons, created_at = excluded.created_at`,
      post.id,
      verdict.score,
      verdict.action,
      JSON.stringify(verdict.reasons),
      now
    )
  })
  // A post a moderator already hid keeps the moderator's notice; the automatic one is not added on top of it.
  if (verdict.action === "hold" && post.removed_at === null) {
    await hidePost(
      {
        postId: post.id,
        category: "spam",
        explanation: `Our automatic checks held this post. They found: ${verdict.reasons.slice(0, 4).join("; ")}.`,
        source: "automod:spam",
      },
      now
    )
  }
  return verdict
}

// Runs when a post goes live. The post is announced (notifications, the new posts pill) only when it is allowed through.
export async function goLive(postId: string, now = Date.now()): Promise<AbuseVerdict | null> {
  const verdict = await screenPost(postId, now)
  if (!verdict || verdict.action !== "allow") return verdict
  const post = await get<{ id: string; author_id: string; body: string; reply_to_id: string | null; quote_of_id: string | null }>(
    "SELECT id, author_id, body, reply_to_id, quote_of_id FROM posts WHERE id = ?",
    postId
  )
  if (post) await announcePost(post)
  return verdict
}

// Scheduled posts go live when their time passes. This runs before reads that show the public feed, so the post appears
// and its notifications fire then, and the checks run at that moment. Many requests and the maintenance pass run it at
// the same moment, so each post is claimed first: only the call whose update took it announces it, and the others skip it.
// A post its author published or moved in the meantime is left alone.
export async function publishDue(now = Date.now()): Promise<void> {
  const due = await all<{ id: string; publish_at: number }>(
    "SELECT id, publish_at FROM posts WHERE is_draft = 0 AND publish_at IS NOT NULL AND publish_at <= ?",
    now
  )
  for (const post of due) {
    const claimed = await transaction(async () => {
      const taken = await change(
        "UPDATE posts SET publish_at = NULL, created_at = ? WHERE id = ? AND is_draft = 0 AND publish_at = ?",
        post.publish_at,
        post.id,
        post.publish_at
      )
      if (taken === 0) return false
      await startPollClock(post.id, post.publish_at)
      return true
    })
    if (claimed) await goLive(post.id, now)
  }
}
