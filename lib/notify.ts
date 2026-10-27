import { newId } from "@/lib/auth"
import { get, run } from "@/lib/db"
import { publish } from "@/lib/bus"
import { canSeePost, type NotificationKind } from "@/lib/data"
import { mayNotify, NOTICE, type DeliveryFacts } from "@/lib/notify-rules"
import { pushNotification } from "@/lib/push"
import { BANNER_PREVIEW_MAX } from "@/lib/rules"

export type { NotificationKind }

export async function blockedEitherWay(a: string, b: string): Promise<boolean> {
  return (
    await get("SELECT 1 AS found FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)", a, b, b, a) !==
    undefined
  )
}

// What decides whether an event reaches the recipient, in one read: their switch for this kind in settings (on unless they
// turned it off), a block either way, and whether they muted the account that acted.
async function deliveryFacts(recipientId: string, actorId: string, kind: NotificationKind): Promise<DeliveryFacts> {
  const row = await get<{ kind_on: number; blocked: number; muted: number }>(
    `SELECT COALESCE((SELECT enabled FROM notification_prefs WHERE user_id = ?1 AND kind = ?3), 1) AS kind_on,
       EXISTS (SELECT 1 FROM blocks WHERE (blocker_id = ?1 AND blocked_id = ?2) OR (blocker_id = ?2 AND blocked_id = ?1)) AS blocked,
       EXISTS (SELECT 1 FROM mutes WHERE muter_id = ?1 AND muted_id = ?2) AS muted`,
    recipientId,
    actorId,
    kind
  )
  return { self: false, kindOn: row?.kind_on === 1, blocked: row?.blocked === 1, muted: row?.muted === 1 }
}

// Writes a notification, tells the recipient's open tabs, and pushes it to their devices. The same rules decide all three.
export async function notify(recipientId: string, actorId: string, kind: NotificationKind, postId: string | null): Promise<void> {
  if (recipientId === actorId) return
  if (!mayNotify(await deliveryFacts(recipientId, actorId, kind))) return
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
  await pushNotification(recipientId, actorId, kind, postId)
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
