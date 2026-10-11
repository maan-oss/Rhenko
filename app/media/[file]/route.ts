import fs from "node:fs"
import { Readable } from "node:stream"
import { contentTypeFor, uploadPath } from "@/lib/uploads"

// Serves uploaded media. Video players seek with Range requests, so this
// route answers them with 206 partial responses.
export async function GET(request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params
  const filePath = uploadPath(file)
  if (!filePath) return new Response("Not found", { status: 404 })

  let size: number
  try {
    size = (await fs.promises.stat(filePath)).size
  } catch {
    return new Response("Not found", { status: 404 })
  }

  const headers: Record<string, string> = {
    "Content-Type": contentTypeFor(file),
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
  }

  const range = request.headers.get("range")
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim())
    if (!match || (match[1] === "" && match[2] === "")) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } })
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
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } })
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
