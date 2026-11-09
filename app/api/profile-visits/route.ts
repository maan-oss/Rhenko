import type { NextRequest } from "next/server"
import { recordProfileVisit } from "@/actions/analytics"

// A profile the person opened, sent by the browser as a beacon, so it still counts when they leave the page at once. The body
// is { profileId }. The reply is empty whether or not the visit counted, so it tells nothing about the profile.
export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return new Response(null, { status: 400 })
  }
  const { profileId } = (body ?? {}) as { profileId?: unknown }
  if (typeof profileId !== "string" || profileId.length > 64) return new Response(null, { status: 400 })

  await recordProfileVisit(profileId)
  return new Response(null, { status: 204 })
}
