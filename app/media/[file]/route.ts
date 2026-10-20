import { getAgreedViewer } from "@/lib/auth"
import { mediaAccess } from "@/lib/data"
import { serveObject } from "@/lib/storage"
import { contentTypeFor, UPLOAD_NAME_PATTERN, variantFile, variantWidthOf } from "@/lib/uploads"

function notFound(): Response {
  return new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } })
}

// Serves uploaded media. A file is served only when the viewer may see it: avatars and banners are public and cached for a
// while; a post's photo or video only to someone who may see a post that uses it; a chat photo only to the members of that
// conversation, never cached. Anything else is a 404, so a private file looks the same as a missing one. Video players
// seek with Range requests. A picture asked for with ?w= comes as a WebP at that width, under the same rules as the original.
export async function GET(request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params
  if (!UPLOAD_NAME_PATTERN.test(file)) return notFound()

  const viewer = await getAgreedViewer()
  const access = await mediaAccess(file, viewer?.id ?? null)
  if (access === "none") return notFound()

  const cacheControl = access === "public" ? "public, max-age=1800" : "private, no-store"
  let name = file
  let contentType = contentTypeFor(file)
  const width = variantWidthOf(new URL(request.url).searchParams.get("w"))
  if (width !== null) {
    const variant = await variantFile(file, width)
    if (variant) {
      name = variant
      contentType = "image/webp"
    }
  }

  return (await serveObject(name, request, { contentType, cacheControl })) ?? notFound()
}
