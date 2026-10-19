import { circleBySlug, type Circle } from "@/lib/circles"
import { listDetail } from "@/lib/data"
import { listOwnersVisibleTo } from "@/lib/people-state"

// The checks that decide whether a list or a circle exists for the person asking. The pages and the proxy's gate
// (lib/route-gate.ts) both call these, so a missing or hidden record gets the same answer from either.

// A list the viewer may open: it exists, it is theirs or public, and its owner is still here and hasn't blocked them.
export async function openList(id: string, viewerId: string) {
  const detail = await listDetail(id, viewerId)
  if (!detail) return null
  if (!detail.list.isOwner && !(await listOwnersVisibleTo(viewerId, [detail.list.owner.id])).has(detail.list.owner.id)) return null
  return detail
}

// The circle the viewer may open: it exists, and its owner is not blocked by or blocking the viewer.
export async function openCircle(slug: string, viewerId: string): Promise<Circle | null> {
  const circle = await circleBySlug(slug.toLowerCase(), viewerId)
  if (!circle) return null
  if (circle.owner && circle.owner.id !== viewerId && !(await listOwnersVisibleTo(viewerId, [circle.owner.id])).has(circle.owner.id))
    return null
  return circle
}
