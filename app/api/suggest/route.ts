import { getViewer } from "@/lib/auth"
import { suggestHandles, suggestTags } from "@/lib/data"

// Autocomplete for the composer: @handles and #topics.
export async function GET(request: Request) {
  const viewer = await getViewer()
  if (!viewer) return Response.json({ users: [], tags: [] }, { status: 401 })
  const q = new URL(request.url).searchParams.get("q") ?? ""
  if (q.startsWith("@")) {
    const prefix = q.slice(1).replace(/[^A-Za-z0-9_]/g, "")
    if (!prefix) return Response.json({ users: [], tags: [] })
    return Response.json({ users: suggestHandles(prefix), tags: [] })
  }
  if (q.startsWith("#")) {
    const prefix = q.slice(1).replace(/[^\p{L}\p{N}_]/gu, "")
    if (!prefix) return Response.json({ users: [], tags: [] })
    return Response.json({ users: [], tags: suggestTags(prefix) })
  }
  return Response.json({ users: [], tags: [] })
}
