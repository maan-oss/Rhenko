import { all, get, run } from "@/lib/db"
import { listOwnersVisibleTo } from "@/lib/people-state"

export type PinnedTimeline = { id: string; name: string }

// A list can be pinned by the people who may open it: its owner, and anyone following it while it is public.
async function mayPin(listId: string, viewerId: string): Promise<boolean> {
  return (
    await get(
      `SELECT 1 AS found FROM lists l
       WHERE l.id = ? AND (l.owner_id = ? OR (l.private = 0 AND EXISTS (SELECT 1 FROM list_follows f WHERE f.list_id = l.id AND f.user_id = ?)))`,
      listId,
      viewerId,
      viewerId
    ) !== undefined
  )
}

export async function isTimelinePinned(viewerId: string, listId: string): Promise<boolean> {
  return await get("SELECT 1 AS found FROM timeline_pins WHERE user_id = ? AND list_id = ?", viewerId, listId) !== undefined
}

export async function timelinePinCount(viewerId: string): Promise<number> {
  return (await get<{ c: number }>("SELECT COUNT(*) AS c FROM timeline_pins WHERE user_id = ?", viewerId))?.c ?? 0
}

// The viewer's pinned lists, in the order they were pinned. A list whose owner has blocked the viewer is left out.
export async function pinnedTimelines(viewerId: string): Promise<PinnedTimeline[]> {
  const rows = await all<{ id: string; name: string; owner_id: string }>(
    `SELECT l.id, l.name, l.owner_id FROM timeline_pins tp
     JOIN lists l ON l.id = tp.list_id
     WHERE tp.user_id = ? AND (l.owner_id = ? OR (l.private = 0 AND EXISTS (SELECT 1 FROM list_follows f WHERE f.list_id = l.id AND f.user_id = ?)))
     ORDER BY tp.created_at ASC`,
    viewerId,
    viewerId,
    viewerId
  )
  const visible = await listOwnersVisibleTo(viewerId, rows.map((row) => row.owner_id))
  return rows.filter((row) => visible.has(row.owner_id)).map((row) => ({ id: row.id, name: row.name }))
}

export async function setTimelinePin(viewerId: string, listId: string, on: boolean, now: number): Promise<void> {
  if (on) {
    if (!await mayPin(listId, viewerId)) return
    // Pinning again keeps the first position.
    await run(
      "INSERT INTO timeline_pins (user_id, list_id, created_at) VALUES (?, ?, ?) ON CONFLICT (user_id, list_id) DO NOTHING",
      viewerId,
      listId,
      now
    )
  } else {
    await run("DELETE FROM timeline_pins WHERE user_id = ? AND list_id = ?", viewerId, listId)
  }
}

export { mayPin }
