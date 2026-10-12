import fs from "node:fs"
import { Readable } from "node:stream"
import { getViewer } from "@/lib/auth"
import { mediaAccess } from "@/lib/data"
import { contentTypeFor, uploadPath, variantFile, variantWidthOf } from "@/lib/uploads"

function notFound(): Response {
  return new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } })
}

// Serves uploaded media. Avatars and banners are public and cached for a day. A post's photo or video is served only
// to someone who may see a post that uses it, and a chat photo only to the members of that conversation, never
// cached; anything else is a 404, so a private file looks the same as a missing one. Video players seek with Range
// requests, so this route answers them with 206 partial responses. A picture asked for with ?w= comes as a WebP at that
// width, under the same rules as the original.
export async function GET(request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params
  const filePath = uploadPath(file)
  if (!filePath) return notFound()

  const viewer = await getViewer()
  const access = mediaAccess(file, viewer?.id ?? null)
  if (access === "none") return notFound()

  const cacheControl = access === "public" ? "public, max-age=86400" : "private, no-store"
  const width = variantWidthOf(new URL(request.url).searchParams.get("w"))
  if (width !== null) {
    const variant = await variantFile(file, width)
    if (variant) {
      try {
        const bytes = await fs.promises.readFile(variant)
        return new Response(new Uint8Array(bytes), {
          headers: { "Content-Type": "image/webp", "Content-Length": String(bytes.length), "Cache-Control": cacheControl, "X-Content-Type-Options": "nosniff" },
        })
      } catch {
        return notFound()
      }
    }
  }

  let size: number
  try {
    size = (await fs.promises.stat(filePath)).size
  } catch {
    return notFound()
  }

  const headers: Record<string, string> = {
    "Content-Type": contentTypeFor(file),
    "Accept-Ranges": "bytes",
    "Cache-Control": access === "public" ? "public, max-age=86400" : "private, no-store",
    "X-Content-Type-Options": "nosniff",
  }

  const rangeError = { "Cache-Control": headers["Cache-Control"], "X-Content-Type-Options": "nosniff" }
  const range = request.headers.get("range")
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim())
    if (!match || (match[1] === "" && match[2] === "")) {
      return new Response(null, { status: 416, headers: { ...rangeError, "Content-Range": `bytes */${size}` } })
    }
    let start: number
    let end: number
    if (match[1] === "") {
      // Suffix range: the last N bytes.
      const suffix = Number(match[2])
      start = Math.max(size - suffix, 0)
      end = size - 1
    } else {
      start = Number(match[1])
      end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1)
    }
    if (start >= size || start > end) {
      return new Response(null, { status: 416, headers: { ...rangeError, "Content-Range": `bytes */${size}` } })
    }
    const stream = Readable.toWeb(fs.createReadStream(filePath, { start, end })) as unknown as ReadableStream
    return new Response(stream, {
      status: 206,
      headers: {
        ...headers,
        "Content-Length": String(end - start + 1),
        "Content-Range": `bytes ${start}-${end}/${size}`,
      },
    })
  }

  const stream = Readable.toWeb(fs.createReadStream(filePath)) as unknown as ReadableStream
  return new Response(stream, {
    headers: { ...headers, "Content-Length": String(size) },
  })
}
