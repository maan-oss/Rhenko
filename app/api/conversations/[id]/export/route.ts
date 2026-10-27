import { getViewer } from "@/lib/auth"
import { all, get } from "@/lib/db"
import { exportableMessages } from "@/lib/data"
import { chatExportText, exportFileName } from "@/lib/chat-export"
import { consume, waitLabel } from "@/lib/rate-limit"

// A chat as a text file, for the person in it: their own view of the chat, with the times in UTC. Photos, videos and voice notes are
// listed, not included. Only people who can read the chat get it, and anyone else gets the same answer as for a chat that doesn't exist.

const EXPORTS_PER_HOUR = 5
const HOUR = 60 * 60 * 1000

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const viewer = await getViewer()
  if (!viewer) return new Response("Sign in to export a chat.", { status: 401, headers: { "Cache-Control": "no-store" } })

  const limit = await consume(`chat-export:${viewer.id}`, EXPORTS_PER_HOUR, HOUR)
  if (!limit.ok) {
    return new Response(`You've exported chats ${EXPORTS_PER_HOUR} times this hour. Try again in ${waitLabel(limit.retryAfterSeconds)}.`, {
      status: 429,
      headers: { "Retry-After": String(limit.retryAfterSeconds), "Cache-Control": "no-store" },
    })
  }

  const { id } = await context.params
  const exported = await exportableMessages(id, viewer.id)
  if (!exported) return new Response("That chat doesn't exist.", { status: 404, headers: { "Cache-Control": "no-store" } })

  const now = Date.now()
  const title = await chatTitle(id, viewer.id)
  const text = chatExportText(title, exported.messages, exported.truncated, now)
  return new Response(text, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFileName(now)}"`,
      "Cache-Control": "no-store",
    },
  })
}

// The name the chat goes by for this viewer: the group's name, or the other person's name for a one-to-one chat.
async function chatTitle(conversationId: string, viewerId: string): Promise<string> {
  const conversation = await get<{ kind: "dm" | "group"; title: string }>("SELECT kind, title FROM conversations WHERE id = ?", conversationId)
  if (conversation?.kind === "group" && conversation.title) return conversation.title
  const others = await all<{ name: string }>(
    `SELECT u.name FROM conversation_members cm JOIN users u ON u.id = cm.user_id
     WHERE cm.conversation_id = ? AND cm.user_id <> ? AND cm.status = 'accepted' ORDER BY u.name`,
    conversationId,
    viewerId
  )
  return others.map((other) => other.name).join(", ")
}
