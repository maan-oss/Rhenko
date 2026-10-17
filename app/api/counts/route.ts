import { getAgreedViewer } from "@/lib/auth"
import { unreadMessageCount, unreadNotificationCount } from "@/lib/data"

// The unread counts behind the navigation badges. A realtime event asks for these, so a badge moves without the page
// the person is reading being rendered again.
export async function GET() {
  const headers = { "Cache-Control": "private, no-store" }
  const viewer = await getAgreedViewer()
  if (!viewer) return Response.json({ notifications: 0, messages: 0 }, { status: 401, headers })
  return Response.json({ notifications: await unreadNotificationCount(viewer.id), messages: await unreadMessageCount(viewer.id) }, { headers })
}
