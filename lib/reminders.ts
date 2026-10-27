// Reminders a person set on a message (actions/messages.ts setMessageReminder). The maintenance pass sends each one once, when it
// comes due: a banner in the app and a push to the person's devices. A reminder is taken out of the table as it is claimed, so it is
// never sent twice. One that can no longer be seen (the message was deleted, hidden, cleared or has expired, or the person left the
// chat) is dropped without a word.

import { all, get } from "@/lib/db"
import { publish, type EventPerson } from "@/lib/bus"
import { canReadConversation } from "@/lib/data"
import { blockedEitherWay } from "@/lib/notify"
import { attachmentPreview, parseAttachment } from "@/lib/message-attachments"
import { pushReminder } from "@/lib/push"

// Reminders one pass sends at most. The rest come due on the next pass.
const DUE_PER_PASS = 100

export async function deliverDueReminders(now: number): Promise<number> {
  const due = await all<{ user_id: string; message_id: string }>(
    `DELETE FROM chat_message_reminders WHERE (user_id, message_id) IN
       (SELECT user_id, message_id FROM chat_message_reminders WHERE remind_at <= ? ORDER BY remind_at LIMIT ?)
     RETURNING user_id, message_id`,
    now,
    DUE_PER_PASS
  )
  let sent = 0
  for (const reminder of due) {
    try {
      if (await sendReminder(now, reminder.user_id, reminder.message_id)) sent++
    } catch (error) {
      console.error("[reminders] sending a reminder failed", error)
    }
  }
  return sent
}

// Sends one reminder if the person can still see the message. Returns whether it was sent.
async function sendReminder(now: number, userId: string, messageId: string): Promise<boolean> {
  const message = await get<{
    conversation_id: string
    sender_id: string
    body: string
    media_file: string | null
    attachment: string | null
    created_at: number
    deleted_at: number | null
    expires_at: number | null
    sender_name: string
    sender_handle: string
    sender_avatar: string | null
  }>(
    `SELECT m.conversation_id, m.sender_id, m.body, m.media_file, m.attachment, m.created_at, m.deleted_at, m.expires_at,
       u.name AS sender_name, u.handle AS sender_handle, u.avatar_file AS sender_avatar
     FROM chat_messages m JOIN users u ON u.id = m.sender_id WHERE m.id = ?`,
    messageId
  )
  if (!message || message.deleted_at !== null) return false
  if (message.expires_at !== null && message.expires_at <= now) return false
  if (!(await canReadConversation(message.conversation_id, userId))) return false
  if (await blockedEitherWay(userId, message.sender_id)) return false
  if (await get("SELECT 1 AS found FROM chat_hidden_messages WHERE message_id = ? AND user_id = ?", messageId, userId)) return false
  const membership = await get<{ cleared_at: number | null }>(
    "SELECT cleared_at FROM conversation_members WHERE conversation_id = ? AND user_id = ?",
    message.conversation_id,
    userId
  )
  if (!membership || (membership.cleared_at !== null && message.created_at <= membership.cleared_at)) return false

  const sender: EventPerson = {
    id: message.sender_id,
    name: message.sender_name,
    handle: message.sender_handle,
    avatarFile: message.sender_avatar,
  }
  const preview = message.body.trim() || attachmentPreview(parseAttachment(message.attachment), message.media_file) || ""
  await publish([userId], {
    type: "banner",
    kind: "message",
    conversationId: message.conversation_id,
    title: "Reminder",
    line: preview ? `${sender.name}: ${preview}` : `A message from ${sender.name}`,
    preview: null,
    href: `/messages/${message.conversation_id}?m=${messageId}`,
    from: sender,
  })
  await pushReminder(userId, {
    conversationId: message.conversation_id,
    messageId,
    senderName: sender.name,
    preview,
  })
  return true
}
