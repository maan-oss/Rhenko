import { all, get } from "@/lib/db"
import { publish } from "@/lib/bus"
import { removeUpload } from "@/lib/uploads"

// Messages deleted in one statement. A backlog is worked through a batch at a time in the same pass.
const BATCH = 500

// Deletes every disappearing message whose time has run out, for everyone, with its photo or voice message in storage.
// Its reactions and translations go with it, and a reply that quoted it loses the quote. Every read already leaves out an
// expired message (lib/data.ts), so a message never shows late; this pass removes what the reads skip. The live events
// about a message carry no text after a minute (lib/bus.ts keeps events that long) and the shortest timer is a day, so
// nothing has to be taken back from the event stream. The members' open tabs are told to refresh, and the message drops
// out of the thread, the list and the unread counts. Returns how many messages went.
export async function expireMessages(now: number): Promise<number> {
  const conversations = new Set<string>()
  const files: string[] = []
  let removed = 0
  for (;;) {
    const rows = await all<{ conversation_id: string; media_file: string | null }>(
      `DELETE FROM chat_messages WHERE id IN (
         SELECT id FROM chat_messages WHERE expires_at IS NOT NULL AND expires_at <= ? ORDER BY expires_at LIMIT ?
       ) RETURNING conversation_id, media_file`,
      now,
      BATCH
    )
    for (const row of rows) {
      conversations.add(row.conversation_id)
      if (row.media_file) files.push(row.media_file)
    }
    removed += rows.length
    if (rows.length < BATCH) break
  }
  // Upload names are random and a chat file belongs to one message. A file that anything still points at is kept anyway.
  for (const file of files) {
    if (!await get("SELECT 1 AS found FROM chat_messages WHERE media_file = ? LIMIT 1", file)) await removeUpload(file)
  }
  for (const conversationId of conversations) {
    const members = await all<{ user_id: string }>("SELECT user_id FROM conversation_members WHERE conversation_id = ?", conversationId)
    await publish(members.map((member) => member.user_id), { type: "message", conversationId })
  }
  return removed
}
