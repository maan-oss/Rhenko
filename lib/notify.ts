import { newId } from "@/lib/auth"
import { run } from "@/lib/db"

export type NotificationKind = "like" | "repost" | "reply" | "quote" | "follow" | "mention"

export function notify(recipientId: string, actorId: string, kind: NotificationKind, postId: string | null): void {
  if (recipientId === actorId) return
  run(
    "INSERT INTO notifications (id, recipient_id, actor_id, kind, post_id, read, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)",
    newId(),
    recipientId,
    actorId,
    kind,
    postId,
    Date.now()
  )
}
