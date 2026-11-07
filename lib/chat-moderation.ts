// The statements that take a chat message's content off the server for everyone, and the record of a moderator's removal. The server
// runs them through lib/db (lib/chat-removal.ts) and the moderation command line runs them through postgres.js
// (scripts/moderation.mjs chat-hide). Both use this file, so they cannot disagree about what is removed.
//
// This file has no imports, so the command line can load it directly.

export type Statement = { sql: string; params: (string | number | null)[] }

// The categories a removal is recorded under. They are the notice categories of lib/legal.ts, the same ones posts use.
export type RemovalCategory = string

// Takes off the server everything a message carries: its words, its attachment, its file reference, its sealed content and the
// wraps that open it, its reactions, translations, pins and reminders. The row stays, so the thread can say the message was removed.
// deleted_at keeps its first value, so a message that the sender deleted keeps the time the sender deleted it.
//
// The caller runs these in one transaction, and removes the stored file itself (only once nothing still keeps it).
export function clearMessageStatements(messageId: string, now: number): Statement[] {
  return [
    {
      sql: "UPDATE chat_messages SET deleted_at = COALESCE(deleted_at, ?), body = '', media_file = NULL, post_id = NULL, cipher = NULL, attachment = NULL WHERE id = ?",
      params: [now, messageId],
    },
    { sql: "DELETE FROM chat_message_wraps WHERE message_id = ?", params: [messageId] },
    { sql: "DELETE FROM message_reactions WHERE message_id = ?", params: [messageId] },
    { sql: "DELETE FROM message_translations WHERE message_id = ?", params: [messageId] },
    { sql: "DELETE FROM chat_pinned_messages WHERE message_id = ?", params: [messageId] },
    { sql: "DELETE FROM chat_message_reminders WHERE message_id = ?", params: [messageId] },
  ]
}

export type RemovalRecord = {
  id: string
  messageId: string
  conversationId: string
  senderId: string
  category: RemovalCategory
  explanation: string
  // Where the removal came from: "moderator" for the command line, or "chat-report:<id>" for a report that hid the message at once.
  source: string
}

// The record of a removal. It is kept for the same period as other moderation records (lib/legal.ts RETENTION.legalNoticesDays).
export function removalRecordStatement(record: RemovalRecord, now: number): Statement {
  return {
    sql: `INSERT INTO chat_message_removals (id, message_id, conversation_id, sender_id, category, explanation, source, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [record.id, record.messageId, record.conversationId, record.senderId, record.category, record.explanation.trim(), record.source, now],
  }
}

// Turns the ? placeholders of a statement into the $1, $2 placeholders postgres.js takes. The statements here never contain a ? in
// their text, only as placeholders, so a plain replacement is exact.
export function numbered(sql: string): string {
  let index = 0
  return sql.replace(/\?/g, () => `$${++index}`)
}
