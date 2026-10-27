import { getAgreedViewer } from "@/lib/auth"
import { cleanGifQuery, gifSetup, previewPath, searchGifs } from "@/lib/gifs"
import { consume, waitLabel } from "@/lib/rate-limit"

// GIF search for the composer's GIF panel: trending when there is no query, otherwise a search. The key and the provider stay
// on this server (lib/gifs.ts). The pictures in the answer are links back to this server, so the viewer's browser never
// contacts the provider.
const SEARCHES = 90
const SEARCH_WINDOW_MS = 10 * 60_000

export async function GET(request: Request) {
  const viewer = await getAgreedViewer()
  if (!viewer) return Response.json({ error: "Sign in first." }, { status: 401 })
  if (!gifSetup()) return Response.json({ error: "GIF search isn't set up on this server." }, { status: 503 })

  const params = new URL(request.url).searchParams
  const query = cleanGifQuery(params.get("q"))
  const cursor = params.get("next")
  if (cursor !== null && !/^\d{1,4}$/.test(cursor)) return Response.json({ error: "Bad request." }, { status: 400 })

  const allowed = await consume(`gifs:${viewer.id}`, SEARCHES, SEARCH_WINDOW_MS)
  if (!allowed.ok) {
    return Response.json(
      { error: `You've searched GIFs a lot. Try again in ${waitLabel(allowed.retryAfterSeconds)}.` },
      { status: 429, headers: { "Retry-After": String(allowed.retryAfterSeconds) } }
    )
  }

  const result = await searchGifs({ query, cursor })
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status })
  const gifs = result.gifs.map((gif) => ({ ...gif, preview: previewPath(gif.preview), still: previewPath(gif.still) }))
  return Response.json({ gifs, next: result.next }, { headers: { "Cache-Control": "private, no-store" } })
}
