import { getAgreedViewer } from "@/lib/auth"
import { fetchGifFile, gifSetup } from "@/lib/gifs"
import { consume, waitLabel } from "@/lib/rate-limit"
import { MAX_IMAGE_BYTES } from "@/lib/rules"

// The file for a GIF the viewer picked. This server downloads it from the provider's CDN and hands it back as a GIF. The
// composer attaches it like a photo from the device, so it goes through the same checks and the same storage (lib/uploads.ts)
// when the post is sent, and the post points at our copy. The biggest size that fits the 4 MB image limit is used; if none
// fits, the answer is a message saying so. The browser sends only the GIF's id, never an address.
const PICKS = 40
const PICK_WINDOW_MS = 60 * 60_000

export async function POST(request: Request) {
  const viewer = await getAgreedViewer()
  if (!viewer) return Response.json({ error: "Sign in first." }, { status: 401 })
  if (!gifSetup()) return Response.json({ error: "GIF search isn't set up on this server." }, { status: 503 })

  let id: unknown
  try {
    id = ((await request.json()) as { id?: unknown }).id
  } catch {
    id = null
  }
  if (typeof id !== "string" || id.length === 0 || id.length > 120) return Response.json({ error: "That GIF isn't available." }, { status: 400 })

  const allowed = await consume(`gifpick:${viewer.id}`, PICKS, PICK_WINDOW_MS)
  if (!allowed.ok) {
    return Response.json(
      { error: `You've added a lot of GIFs in the last hour. Try again in ${waitLabel(allowed.retryAfterSeconds)}.` },
      { status: 429, headers: { "Retry-After": String(allowed.retryAfterSeconds) } }
    )
  }

  const file = await fetchGifFile(id, { maxBytes: MAX_IMAGE_BYTES })
  if (!file.ok) return Response.json({ error: file.error }, { status: file.status })
  return new Response(file.bytes, {
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(file.bytes.length),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
