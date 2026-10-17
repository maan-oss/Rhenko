import { all, get, run } from "@/lib/db"
import { canSeeLivePost } from "@/lib/data"
import { notify } from "@/lib/notify"
import { asReplySetting, extractMentions, POST_UNAVAILABLE, replyAllowed, replyRefusal, type ReplySetting } from "@/lib/rules"
import { publish } from "@/lib/bus"
import { removeUpload } from "@/lib/uploads"
import { queueQuestion } from "@/lib/sahayak-queue"
import { asksSahayak } from "@/lib/sahayak-prompt"

export async function isFollowing(followerId: string, followeeId: string): Promise<boolean> {
  return await get("SELECT 1 AS found FROM follows WHERE follower_id = ? AND followee_id = ?", followerId, followeeId) !== undefined
}

// Whether a viewer may reply to a post. The post must be live and visible to them (which also rules out blocks), and
// its reply setting must allow them. On success it returns that setting, which the reply inherits.
export async function replyPermission(viewerId: string, parentId: string): Promise<{ ok: true; setting: ReplySetting } | { ok: false; error: string }> {
  if (!await canSeeLivePost(parentId, viewerId)) return { ok: false, error: POST_UNAVAILABLE }
  const parent = await get<{ author_id: string; reply_setting: string; body: string; answered_id: string | null }>(
    `SELECT p.author_id, p.reply_setting, p.body, (SELECT pp.author_id FROM posts pp WHERE pp.id = p.reply_to_id) AS answered_id
     FROM posts p WHERE p.id = ?`,
    parentId
  )
  if (!parent) return { ok: false, error: POST_UNAVAILABLE }
  const setting = asReplySetting(parent.reply_setting)
  const handle = (await get<{ handle: string }>("SELECT handle FROM users WHERE id = ?", viewerId))?.handle.toLowerCase() ?? ""
  const allowed = replyAllowed(setting, {
    isAuthor: parent.author_id === viewerId,
    isAnswered: parent.answered_id === viewerId,
    followedByAuthor: setting === "following" && await isFollowing(parent.author_id, viewerId),
    mentioned: setting === "mentioned" && handle !== "" && extractMentions(parent.body).includes(handle),
  })
  return allowed ? { ok: true, setting } : { ok: false, error: replyRefusal(setting) }
}

// A poll's clock starts when its post goes live: it ends its chosen length after `liveAt`. Polls made before lengths
// were stored (duration 0) keep the end time they have.
export async function startPollClock(postId: string, liveAt: number): Promise<void> {
  await run("UPDATE polls SET ends_at = ? + duration_ms WHERE post_id = ? AND duration_ms > 0", liveAt, postId)
}

type Announced = { id: string; author_id: string; body: string; reply_to_id: string | null; quote_of_id: string | null }

// Sends the reply, quote and mention notifications for a post that just went live.
export async function announcePost(post: Announced): Promise<void> {
  const notified = new Set<string>()
  if (post.reply_to_id) {
    const parent = await get<{ author_id: string }>("SELECT author_id FROM posts WHERE id = ?", post.reply_to_id)
    if (parent && parent.author_id !== post.author_id) {
      await notify(parent.author_id, post.author_id, "reply", post.id)
      notified.add(parent.author_id)
    }
  }
  if (post.quote_of_id) {
    const quoted = await get<{ author_id: string }>("SELECT author_id FROM posts WHERE id = ?", post.quote_of_id)
    if (quoted && quoted.author_id !== post.author_id && !notified.has(quoted.author_id)) {
      await notify(quoted.author_id, post.author_id, "quote", post.id)
      notified.add(quoted.author_id)
    }
  }
  const author = await get<{ verified: number; bot: number }>("SELECT verified, bot FROM users WHERE id = ?", post.author_id)
  const mentions = extractMentions(post.body)
  for (const handle of mentions) {
    const user = await get<{ id: string; mentions_verified_only: number; bot: number }>(
      "SELECT id, mentions_verified_only, bot FROM users WHERE handle = ?",
      handle
    )
    // Someone who only wants mentions from verified accounts doesn't hear about the rest. The bot account has no
    // notifications: a mention of it is a question, queued below.
    const filtered = user?.mentions_verified_only === 1 && author?.verified !== 1
    if (user && user.bot !== 1 && user.id !== post.author_id && !notified.has(user.id) && !filtered) {
      await notify(user.id, post.author_id, "mention", post.id)
      notified.add(user.id)
    }
  }
  // A question for Sahayak. Its own replies never queue one, so an answer cannot start another.
  if (author?.bot !== 1 && asksSahayak(mentions)) await queueQuestion(post.id, post.author_id)
  // People who turned on post notifications for this account hear about new posts,
  // not replies. They must still follow the account, so an unfollow ends the alert.
  if (!post.reply_to_id) {
    const subscribers = await all<{ user_id: string }>(
      `SELECT s.user_id FROM post_subscriptions s
       JOIN follows f ON f.follower_id = s.user_id AND f.followee_id = s.author_id
       WHERE s.author_id = ?`,
      post.author_id
    )
    for (const { user_id } of subscribers) {
      if (user_id === post.author_id || notified.has(user_id)) continue
      await notify(user_id, post.author_id, "post", post.id)
      notified.add(user_id)
    }
  }
  // Followers get a "new posts" pill on Following. It counts the posts that feed shows: top-level posts and the next
  // posts of a thread, not plain replies. A blocked or muted pair hears nothing.
  const onFeed = post.reply_to_id === null || ((await get<{ thread_id: string | null }>("SELECT thread_id FROM posts WHERE id = ?", post.id))?.thread_id ?? null) !== null
  if (onFeed) {
    const followers = await all<{ follower_id: string }>(
      `SELECT f.follower_id FROM follows f
       JOIN users u ON u.id = f.follower_id
       WHERE f.followee_id = ? AND f.follower_id <> ? AND u.deactivated_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = f.follower_id AND b.blocked_id = f.followee_id) OR (b.blocker_id = f.followee_id AND b.blocked_id = f.follower_id))
         AND NOT EXISTS (SELECT 1 FROM mutes m WHERE m.muter_id = f.follower_id AND m.muted_id = f.followee_id)`,
      post.author_id,
      post.author_id
    )
    await publish(
      followers.map((row) => row.follower_id),
      { type: "posts", postId: post.id }
    )
  }
}

// Media files that belong to these posts. Collected before a delete, since
// the cascade removes the rows.
export async function mediaFilesFor(postIds: string[]): Promise<string[]> {
  if (postIds.length === 0) return []
  const marks = postIds.map(() => "?").join(",")
  return (await all<{ file: string }>(`SELECT file FROM post_media WHERE post_id IN (${marks})`, ...postIds)).map((r) => r.file)
}

// The post plus every reply below it, through all depths.
export async function thread(postId: string): Promise<string[]> {
  return (await all<{ id: string }>(
    `WITH RECURSIVE tree(id) AS (
       SELECT id FROM posts WHERE id = ?
       UNION ALL
       SELECT p.id FROM posts p JOIN tree t ON p.reply_to_id = t.id
     ) SELECT id FROM tree`,
    postId
  )).map((r) => r.id)
}

export async function removeFiles(files: string[]): Promise<void> {
  for (const file of files) await removeUpload(file)
}

// Every post a user wrote, plus the replies below them. Used when an account is deleted.
export async function treeOfAuthor(userId: string): Promise<string[]> {
  return (await all<{ id: string }>(
    `WITH RECURSIVE tree(id) AS (
       SELECT id FROM posts WHERE author_id = ?
       UNION ALL
       SELECT p.id FROM posts p JOIN tree t ON p.reply_to_id = t.id
     ) SELECT id FROM tree`,
    userId
  )).map((r) => r.id)
}
