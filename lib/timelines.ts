import { all, get, run } from "@/lib/db"
import { listOwnersVisibleTo } from "@/lib/people-state"

export type PinnedTimeline = { id: string; name: string }

// A list can be pinned by the people who may open it: its owner, and anyone following it while it is public.
function mayPin(listId: string, viewerId: string): boolean {
  return (
    get(
      `SELECT 1 AS found FROM lists l
       WHERE l.id = ? AND (l.owner_id = ? OR (l.private = 0 AND EXISTS (SELECT 1 FROM list_follows f WHERE f.list_id = l.id AND f.user_id = ?)))`,
      listId,
      viewerId,
      viewerId
    ) !== undefined
  )
}

export function isTimelinePinned(viewerId: string, listId: string): boolean {
  return get("SELECT 1 AS found FROM timeline_pins WHERE user_id = ? AND list_id = ?", viewerId, listId) !== undefined
}

export function timelinePinCount(viewerId: string): number {
  return get<{ c: number }>("SELECT COUNT(*) AS c FROM timeline_pins WHERE user_id = ?", viewerId)?.c ?? 0
}

// The viewer's pinned lists, in the order they were pinned. A list whose owner has blocked the viewer is left out.
export function pinnedTimelines(viewerId: string): PinnedTimeline[] {
  const rows = all<{ id: string; name: string; owner_id: string }>(
    `SELECT l.id, l.name, l.owner_id FROM timeline_pins tp
     JOIN lists l ON l.id = tp.list_id
     WHERE tp.user_id = ? AND (l.owner_id = ? OR (l.private = 0 AND EXISTS (SELECT 1 FROM list_follows f WHERE f.list_id = l.id AND f.user_id = ?)))
     ORDER BY tp.created_at ASC`,
    viewerId,
    viewerId,
    viewerId
  )
  const visible = listOwnersVisibleTo(viewerId, rows.map((row) => row.owner_id))
  return rows.filter((row) => visible.has(row.owner_id)).map((row) => ({ id: row.id, name: row.name }))
}

export function setTimelinePin(viewerId: string, listId: string, on: boolean, now: number): void {
  if (on) {
    if (!mayPin(listId, viewerId)) return
    // Pinning again keeps the first position.
    run(
      "INSERT INTO timeline_pins (user_id, list_id, created_at) VALUES (?, ?, ?) ON CONFLICT (user_id, list_id) DO NOTHING",
      viewerId,
      listId,
      now
    )
  } else {
    run("DELETE FROM timeline_pins WHERE user_id = ? AND list_id = ?", viewerId, listId)
  }
}

export { mayPin }
