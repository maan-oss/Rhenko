import { getViewer } from "@/lib/auth"
import { suggestHandles, suggestTags } from "@/lib/data"

// Autocomplete for the composer: @handles and #topics. Handles leave out deactivated accounts and anyone blocked
// either way; topics come from live posts by active accounts.
export async function GET(request: Request) {
  const viewer = await getViewer()
  if (!viewer) return Response.json({ users: [], tags: [] }, { status: 401 })
  const q = (new URL(request.url).searchParams.get("q") ?? "").slice(0, 60)
  if (q.startsWith("@")) {
    const prefix = q.slice(1).replace(/[^A-Za-z0-9_]/g, "")
    if (!prefix) return Response.json({ users: [], tags: [] })
    return Response.json({ users: await suggestHandles(prefix, viewer.id), tags: [] })
  }
  if (q.startsWith("#")) {
    const prefix = q.slice(1).replace(/[^\p{L}\p{N}_]/gu, "")
    if (!prefix) return Response.json({ users: [], tags: [] })
    return Response.json({ users: [], tags: await suggestTags(prefix) })
  }
  return Response.json({ users: [], tags: [] })
}
