import { getViewer } from "@/lib/auth"
import { feedFor, parseSpec } from "@/lib/feeds"

// Next page of any feed. The client calls this as the reader nears the end of the list.
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
  return Response.json(feedFor(spec, viewer.id, cursor))
}
