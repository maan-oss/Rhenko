import { getViewer } from "@/lib/auth"
import { exportChatOf } from "@/lib/data"
import { EXPORTS_PER_HOUR, EXPORT_WINDOW_MS, chatExportText, exportFileName } from "@/lib/chat-export"
import { consume, waitLabel } from "@/lib/rate-limit"

// A chat as a text file, for the person in it: their own view of the chat, with the times in UTC. Photos, videos and voice notes are
// listed, not included. Only people who can read the chat get it, and anyone else gets the same answer as for a chat that doesn't exist.
// An encrypted chat is not exported here: its messages are read on the device, which exports them from the app.

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const viewer = await getViewer()
  if (!viewer) return new Response("Sign in to export a chat.", { status: 401, headers: { "Cache-Control": "no-store" } })

  const limit = await consume(`chat-export:${viewer.id}`, EXPORTS_PER_HOUR, EXPORT_WINDOW_MS)
  if (!limit.ok) {
    return new Response(`You've exported chats ${EXPORTS_PER_HOUR} times this hour. Try again in ${waitLabel(limit.retryAfterSeconds)}.`, {
      status: 429,
      headers: { "Retry-After": String(limit.retryAfterSeconds), "Cache-Control": "no-store" },
    })
  }

  const { id } = await context.params
  const exported = await exportChatOf(id, viewer.id)
  if (!exported) return new Response("That chat doesn't exist.", { status: 404, headers: { "Cache-Control": "no-store" } })
  if (exported.messages.some((message) => message.sealed !== null)) {
    return new Response("This chat is encrypted. Export it from the app, where its messages are read on this device.", {
      status: 409,
      headers: { "Cache-Control": "no-store" },
    })
  }

  const now = Date.now()
  const text = chatExportText(exported.title, exported.messages, exported.truncated, now)
  return new Response(text, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFileName(now)}"`,
      "Cache-Control": "no-store",
    },
  })
}
