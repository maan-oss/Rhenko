import type { NextRequest } from "next/server"
import { recordDwell } from "@/actions/feed"
import { recordViews } from "@/actions/posts"

// What the browser has counted for posts on screen: views, and how long each one was seen. It is sent as a keepalive request, so
// it still goes through when the person has moved on to another page. The body is { views?: string[], dwell?: { postId, ms }[] }.
// The reply is empty whether or not anything counted, so it tells nothing about the posts.
export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return new Response(null, { status: 400 })
  }
  const { views, dwell } = (body ?? {}) as { views?: unknown; dwell?: unknown }
  if (Array.isArray(views)) await recordViews(views as string[])
  if (Array.isArray(dwell)) await recordDwell(dwell as { postId: string; ms: number }[])
  return new Response(null, { status: 204 })
}
