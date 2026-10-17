import { newId } from "@/lib/auth"
import { get, run } from "@/lib/db"
import { publish } from "@/lib/bus"
import { canSeePost, type NotificationKind } from "@/lib/data"
import { BANNER_PREVIEW_MAX } from "@/lib/rules"

export type { NotificationKind }

// True unless the person switched this kind of notification off in settings.
export async function wantsNotification(recipientId: string, kind: NotificationKind): Promise<boolean> {
  const row = await get<{ enabled: number }>(
    "SELECT enabled FROM notification_prefs WHERE user_id = ? AND kind = ?",
    recipientId,
    kind
  )
  return row ? row.enabled === 1 : true
}

export async function blockedEitherWay(a: string, b: string): Promise<boolean> {
  return (
    await get("SELECT 1 AS found FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)", a, b, b, a) !==
    undefined
  )
}

// What each notification says, the same wording the notifications page uses.
const NOTICE: Record<NotificationKind, string> = {
  like: "liked your post",
  repost: "reposted your post",
  reply: "replied to you",
  quote: "quoted your post",
  follow: "followed you",
  mention: "mentioned you",
  follow_request: "asked to follow you",
  poll: "A poll you voted in has ended",
  post: "posted",
}

// True when `muterId` muted `mutedId`. A muted account's activity doesn't notify the person who muted it.
export async function hasMuted(muterId: string, mutedId: string): Promise<boolean> {
  return await get("SELECT 1 AS found FROM mutes WHERE muter_id = ? AND muted_id = ?", muterId, mutedId) !== undefined
}

export async function notify(recipientId: string, actorId: string, kind: NotificationKind, postId: string | null): Promise<void> {
  if (recipientId === actorId) return
  if (!await wantsNotification(recipientId, kind)) return
  if (await blockedEitherWay(recipientId, actorId)) return
  if (await hasMuted(recipientId, actorId)) return
  await run(
    "INSERT INTO notifications (id, recipient_id, actor_id, kind, post_id, read, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)",
    newId(),
    recipientId,
    actorId,
    kind,
    postId,
    Date.now()
  )
  await publish([recipientId], { type: "notification" })
  await announceNotification(recipientId, actorId, kind, postId)
}

// A banner for the notification, with a short excerpt of the post it is about. The excerpt appears only when the
// recipient may see that post, so a mention or reply from an account hidden from them shows no text.
async function announceNotification(recipientId: string, actorId: string, kind: NotificationKind, postId: string | null): Promise<void> {
  const actor = await get<{ id: string; name: string; handle: string; avatar_file: string | null }>(
    "SELECT id, name, handle, avatar_file FROM users WHERE id = ?",
    actorId
  )
  if (!actor) return
  const post = postId && await canSeePost(postId, recipientId) ? await get<{ body: string }>("SELECT body FROM posts WHERE id = ?", postId) : undefined
  const text = post?.body.replace(/\s+/g, " ").trim() ?? ""
  const preview = text.length > BANNER_PREVIEW_MAX ? `${text.slice(0, BANNER_PREVIEW_MAX - 1)}…` : text
  await publish([recipientId], {
    type: "banner",
    kind,
    conversationId: null,
    title: actor.name,
    line: NOTICE[kind],
    preview: preview || null,
    href: "/notifications",
    from: { id: actor.id, name: actor.name, handle: actor.handle, avatarFile: actor.avatar_file },
  })
}
