import { get, run, transaction } from "@/lib/db"
import { clearMessageStatements, removalRecordStatement, type RemovalRecord } from "@/lib/chat-moderation"
import { reportFileKept } from "@/lib/chat-report-store"
import { removeUpload } from "@/lib/uploads"

// Takes a chat message's content off the server for everyone (lib/chat-moderation.ts). Used when the sender deletes a message, and when
// a moderator or an urgent report removes one. A record of a moderator's or report's removal is written with it.
//
// A stored file is removed only when no other message still points at it and no chat report keeps it (a report keeps its files for a
// year, lib/chat-report-store.ts). The command line queues the same check for the background pass (scripts/moderation.mjs chat-hide).
export async function clearChatMessage(
  messageId: string,
  now: number,
  record?: Omit<RemovalRecord, "messageId" | "conversationId" | "senderId">
): Promise<{ conversationId: string; senderId: string } | null> {
  const message = await get<{ conversation_id: string; sender_id: string; media_file: string | null }>(
    "SELECT conversation_id, sender_id, media_file FROM chat_messages WHERE id = ?",
    messageId
  )
  if (!message) return null
  await transaction(async () => {
    for (const statement of clearMessageStatements(messageId, now)) await run(statement.sql, ...statement.params)
    if (record) {
      const statement = removalRecordStatement(
        { ...record, messageId, conversationId: message.conversation_id, senderId: message.sender_id },
        now
      )
      await run(statement.sql, ...statement.params)
    }
  })
  if (message.media_file && !(await get("SELECT 1 AS found FROM chat_messages WHERE media_file = ? LIMIT 1", message.media_file)) && !(await reportFileKept(message.media_file))) {
    await removeUpload(message.media_file)
  }
  return { conversationId: message.conversation_id, senderId: message.sender_id }
}
