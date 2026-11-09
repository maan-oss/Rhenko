import { markConversationRead } from "@/actions/messages"

// Opening a conversation marks it read. The browser sends this as a keepalive request rather than a server action, because an
// action is sent to whichever page is showing when it goes out, and a chat that was just left may be the wrong place for it.
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params
  await markConversationRead(id)
  return new Response(null, { status: 204 })
}
