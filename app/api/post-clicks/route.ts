import type { NextRequest } from "next/server"
import { getAgreedViewer } from "@/lib/auth"
import { visiblePostIds } from "@/lib/data"
import { isClickKind, recordPostClick } from "@/lib/post-clicks"

// A click on a post, sent by the browser as the person clicks, as a beacon, so it still goes through when the click leaves the
// page. The body is { postId, kind }. The reply is empty whether or not the click counted, so it tells nothing about the post.
export async function POST(request: NextRequest) {
  const viewer = await getAgreedViewer()
  if (!viewer) return new Response(null, { status: 204 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return new Response(null, { status: 400 })
  }
  const { postId, kind } = (body ?? {}) as { postId?: unknown; kind?: unknown }
  if (typeof postId !== "string" || postId.length > 64 || !isClickKind(kind)) return new Response(null, { status: 400 })

  if (visiblePostIds([postId], viewer.id, true).has(postId)) recordPostClick(viewer.id, postId, kind)
  return new Response(null, { status: 204 })
}
