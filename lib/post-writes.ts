import { all, get, run } from "@/lib/db"
import { notify, blockedEitherWay } from "@/lib/notify"
import { extractMentions } from "@/lib/rules"
import { removeUpload } from "@/lib/uploads"

export function isFollowing(followerId: string, followeeId: string): boolean {
  return get("SELECT 1 AS found FROM follows WHERE follower_id = ? AND followee_id = ?", followerId, followeeId) !== undefined
}

// Whether a viewer may reply to a post, honouring the author's reply setting.
export function replyPermission(viewerId: string, parentId: string): { ok: true } | { ok: false; error: string } {
  const parent = get<{ author_id: string; reply_setting: string; body: string }>(
    "SELECT author_id, reply_setting, body FROM posts WHERE id = ?",
    parentId
  )
  if (!parent) return { ok: false, error: "That post was deleted." }
  if (parent.author_id === viewerId) return { ok: true }
  if (blockedEitherWay(viewerId, parent.author_id)) return { ok: false, error: "You can't reply to this post." }
  if (parent.reply_setting === "following" && !isFollowing(parent.author_id, viewerId)) {
    return { ok: false, error: "Only accounts the author follows can reply." }
  }
  if (parent.reply_setting === "mentioned") {
    const handle = get<{ handle: string }>("SELECT handle FROM users WHERE id = ?", viewerId)?.handle.toLowerCase() ?? ""
    if (!extractMentions(parent.body).includes(handle)) {
      return { ok: false, error: "Only accounts mentioned in this post can reply." }
    }
  }
  return { ok: true }
}

type Announced = { id: string; author_id: string; body: string; reply_to_id: string | null; quote_of_id: string | null }

// Sends the reply, quote and mention notifications for a post that just went live.
export function announcePost(post: Announced): void {
  const notified = new Set<string>()
  if (post.reply_to_id) {
    const parent = get<{ author_id: string }>("SELECT author_id FROM posts WHERE id = ?", post.reply_to_id)
    if (parent && parent.author_id !== post.author_id) {
      notify(parent.author_id, post.author_id, "reply", post.id)
      notified.add(parent.author_id)
    }
  }
  if (post.quote_of_id) {
    const quoted = get<{ author_id: string }>("SELECT author_id FROM posts WHERE id = ?", post.quote_of_id)
    if (quoted && quoted.author_id !== post.author_id && !notified.has(quoted.author_id)) {
      notify(quoted.author_id, post.author_id, "quote", post.id)
      notified.add(quoted.author_id)
    }
  }
  for (const handle of extractMentions(post.body)) {
    const user = get<{ id: string }>("SELECT id FROM users WHERE handle = ? COLLATE NOCASE", handle)
    if (user && user.id !== post.author_id && !notified.has(user.id)) {
      notify(user.id, post.author_id, "mention", post.id)
      notified.add(user.id)
    }
  }
}

// Scheduled posts go live when their time passes. This runs before reads that
// show the public feed, so the post appears and its notifications fire then.
export function publishDue(now = Date.now()): void {
  const due = all<Announced & { publish_at: number }>(
    `SELECT id, author_id, body, reply_to_id, quote_of_id, publish_at FROM posts
     WHERE is_draft = 0 AND publish_at IS NOT NULL AND publish_at <= ?`,
    now
  )
  for (const post of due) {
    run("UPDATE posts SET publish_at = NULL, created_at = ? WHERE id = ?", post.publish_at, post.id)
    announcePost(post)
  }
}

// Media files that belong to these posts. Collected before a delete, since
// the cascade removes the rows.
export function mediaFilesFor(postIds: string[]): string[] {
  if (postIds.length === 0) return []
  const marks = postIds.map(() => "?").join(",")
  return all<{ file: string }>(`SELECT file FROM post_media WHERE post_id IN (${marks})`, ...postIds).map((r) => r.file)
}

// The post plus every reply below it, through all depths.
export function thread(postId: string): string[] {
  return all<{ id: string }>(
    `WITH RECURSIVE tree(id) AS (
       SELECT id FROM posts WHERE id = ?
       UNION ALL
       SELECT p.id FROM posts p JOIN tree t ON p.reply_to_id = t.id
     ) SELECT id FROM tree`,
    postId
  ).map((r) => r.id)
}

export function removeFiles(files: string[]): void {
  for (const file of files) removeUpload(file)
}

// Every post a user wrote, plus the replies below them. Used when an account is deleted.
export function treeOfAuthor(userId: string): string[] {
  return all<{ id: string }>(
    `WITH RECURSIVE tree(id) AS (
       SELECT id FROM posts WHERE author_id = ?
       UNION ALL
       SELECT p.id FROM posts p JOIN tree t ON p.reply_to_id = t.id
     ) SELECT id FROM tree`,
    userId
  ).map((r) => r.id)
}
