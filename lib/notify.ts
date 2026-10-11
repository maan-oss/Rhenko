import { newId } from "@/lib/auth"
import { get, run } from "@/lib/db"
import { publish } from "@/lib/bus"
import type { NotificationKind } from "@/lib/data"

export type { NotificationKind }

// True unless the person switched this kind of notification off in settings.
export function wantsNotification(recipientId: string, kind: NotificationKind): boolean {
  const row = get<{ enabled: number }>(
    "SELECT enabled FROM notification_prefs WHERE user_id = ? AND kind = ?",
    recipientId,
    kind
  )
  return row ? row.enabled === 1 : true
}

export function blockedEitherWay(a: string, b: string): boolean {
  return (
    get("SELECT 1 AS found FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)", a, b, b, a) !==
    undefined
  )
}

export function notify(recipientId: string, actorId: string, kind: NotificationKind, postId: string | null): void {
  if (recipientId === actorId) return
  if (!wantsNotification(recipientId, kind)) return
  if (blockedEitherWay(recipientId, actorId)) return
  run(
    "INSERT INTO notifications (id, recipient_id, actor_id, kind, post_id, read, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)",
    newId(),
    recipientId,
    actorId,
    kind,
    postId,
    Date.now()
  )
  publish([recipientId], { type: "notification" })
}
