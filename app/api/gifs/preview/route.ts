import { getAgreedViewer } from "@/lib/auth"
import { fetchGifPreview, gifSetup } from "@/lib/gifs"
import { consume, waitLabel } from "@/lib/rate-limit"

// One small picture for the GIF panel, fetched by this server from the provider's own domain. Only addresses on that domain
// are fetched, over https, and only pictures come back. This keeps the page's images on this server (the Content Security
// Policy allows no other site) and keeps viewers' addresses from the provider.
const PREVIEWS = 2400
const PREVIEW_WINDOW_MS = 60 * 60_000

export async function GET(request: Request) {
  const viewer = await getAgreedViewer()
  if (!viewer) return new Response("Sign in first.", { status: 401 })
  if (!gifSetup()) return new Response("GIF search isn't set up on this server.", { status: 503 })

  const address = new URL(request.url).searchParams.get("u") ?? ""
  const allowed = await consume(`gifpreview:${viewer.id}`, PREVIEWS, PREVIEW_WINDOW_MS)
  if (!allowed.ok) {
    return new Response(`Try again in ${waitLabel(allowed.retryAfterSeconds)}.`, { status: 429, headers: { "Retry-After": String(allowed.retryAfterSeconds) } })
  }

  const picture = await fetchGifPreview(address)
  if (!picture.ok) return new Response(picture.error, { status: picture.status })
  return new Response(picture.bytes, {
    headers: {
      "Content-Type": picture.type,
      "Content-Length": String(picture.bytes.length),
      // The browser keeps it for a day, for this viewer only.
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  })
}
