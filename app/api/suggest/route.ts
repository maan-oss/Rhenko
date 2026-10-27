import { getAgreedViewer } from "@/lib/auth"
import { suggestCashtags, suggestHandles, suggestTags } from "@/lib/data"
import { MAX_CASHTAG } from "@/lib/rules"

// Autocomplete for the composer: @handles, #topics and $cashtags. Handles leave out deactivated accounts and anyone blocked
// either way; topics and cashtags come from live posts by active accounts.
export async function GET(request: Request) {
  const viewer = await getAgreedViewer()
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
  if (q.startsWith("$")) {
    // A cashtag is letters only, so "$5" and "$100" suggest nothing.
    const prefix = q.slice(1)
    if (prefix.length === 0 || prefix.length > MAX_CASHTAG || !/^[A-Za-z]+$/.test(prefix)) return Response.json({ users: [], tags: [] })
    return Response.json({ users: [], tags: await suggestCashtags(prefix) })
  }
  return Response.json({ users: [], tags: [] })
}
