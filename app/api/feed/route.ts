import { getViewer } from "@/lib/auth"
import { feedFor, parseSpec } from "@/lib/feeds"

// Next page of any feed. The client calls this as the reader nears the end of the list. feedFor applies who may read
// what: a Likes tab only for the account's owner, a private list only for its owner, and every post's visibility.
export async function GET(request: Request) {
  const viewer = await getViewer()
  if (!viewer) return Response.json({ error: "Sign in first." }, { status: 401 })

  const url = new URL(request.url)
  let raw: unknown
  try {
    raw = JSON.parse(url.searchParams.get("spec") ?? "null")
  } catch {
    return Response.json({ error: "Bad feed." }, { status: 400 })
  }
  const spec = parseSpec(raw)
  if (!spec) return Response.json({ error: "Bad feed." }, { status: 400 })
  const cursor = url.searchParams.get("cursor") ?? undefined
  if (cursor !== undefined && cursor.length > 200) return Response.json({ error: "Bad feed." }, { status: 400 })
  return Response.json(feedFor(spec, viewer.id, cursor))
}
