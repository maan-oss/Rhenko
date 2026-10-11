import { readFile } from "node:fs/promises"
import { contentTypeFor, uploadPath } from "@/lib/uploads"

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params
  const path = uploadPath(file)
  if (!path) return new Response("Not found", { status: 404 })
  try {
    const data = await readFile(path)
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": contentTypeFor(file),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch {
    return new Response("Not found", { status: 404 })
  }
}
