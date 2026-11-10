import { all, get, run, transaction } from "@/lib/db"
import { listOwnersVisibleTo } from "@/lib/people-state"
import { movedOrder, reslot, tabKey, type TabRef } from "@/lib/home-tab-order"
import { snoozedTopics } from "@/lib/topic-snoozes"

export { tabKey }

// A Home tab the viewer pinned: a list they can open, or a followed topic. Both sit in one order, which the viewer sets.
export type PinnedTab = { kind: "list"; id: string; name: string } | { kind: "topic"; tag: string }

// Names one pinned tab in a request. A list is named by its id, a topic by its tag.
export type HomeTabRef = TabRef

// A list can be pinned by the people who may open it: its owner, and anyone following it while it is public.
export async function mayPin(listId: string, viewerId: string): Promise<boolean> {
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

export async function isTopicTabPinned(viewerId: string, tag: string): Promise<boolean> {
  return await get("SELECT 1 AS found FROM topic_tab_pins WHERE user_id = ? AND tag = ?", viewerId, tag) !== undefined
}

// Every Home tab the viewer has pinned, including ones that are hidden for now. The cap counts these.
export async function homeTabCount(viewerId: string): Promise<number> {
  const row = await get<{ c: number | string }>(
    `SELECT (SELECT COUNT(*) FROM timeline_pins WHERE user_id = ?) + (SELECT COUNT(*) FROM topic_tab_pins WHERE user_id = ?) AS c`,
    viewerId,
    viewerId
  )
  return Number(row?.c ?? 0)
}

// The viewer's Home tabs in the order they were placed. A list whose owner has blocked the viewer is left out, and so is a
// topic that is snoozed (its tab comes back when the snooze ends). A topic that is no longer followed is left out too.
export async function pinnedTabs(viewerId: string, now: number): Promise<PinnedTab[]> {
  return (await orderedTabs(viewerId, now)).visible
}

type Row = { tab: HomeTabRef; name: string; position: number; created: number; show: boolean }

// Every pin in order, with the ones that show on Home marked. Positions are shared, so a list and a topic can sit side by side.
async function orderedTabs(viewerId: string, now: number): Promise<{ rows: Row[]; visible: PinnedTab[] }> {
  const lists = await all<{ id: string; name: string; owner_id: string; position: number | string; created_at: number | string }>(
    `SELECT l.id, l.name, l.owner_id, tp.position, tp.created_at FROM timeline_pins tp
     JOIN lists l ON l.id = tp.list_id
     WHERE tp.user_id = ?`,
    viewerId
  )
  const topics = await all<{ tag: string; position: number | string; created_at: number | string }>(
    "SELECT tag, position, created_at FROM topic_tab_pins WHERE user_id = ?",
    viewerId
  )
  const visibleOwners = await listOwnersVisibleTo(viewerId, lists.map((row) => row.owner_id))
  const snoozed = await snoozedTopics(viewerId, now)
  const followed = new Set(
    (await all<{ tag: string }>("SELECT tag FROM topic_follows WHERE user_id = ?", viewerId)).map((row) => row.tag)
  )
  const rows: Row[] = [
    ...lists.map((row): Row => ({
      tab: { kind: "list", id: row.id },
      name: row.name,
      position: Number(row.position),
      created: Number(row.created_at),
      show: visibleOwners.has(row.owner_id),
    })),
    ...topics.map((row): Row => ({
      tab: { kind: "topic", tag: row.tag },
      name: `#${row.tag}`,
      position: Number(row.position),
      created: Number(row.created_at),
      show: followed.has(row.tag) && !snoozed.has(row.tag),
    })),
  ].sort((a, b) => a.position - b.position || a.created - b.created)
  const visible = rows
    .filter((row) => row.show)
    .map((row): PinnedTab => (row.tab.kind === "list" ? { kind: "list", id: row.tab.id, name: row.name } : { kind: "topic", tag: row.tab.tag }))
  return { rows, visible }
}

// The next place at the end of the viewer's Home tabs.
async function nextPosition(viewerId: string): Promise<number> {
  const row = await get<{ top: number | string | null }>(
    `SELECT GREATEST(
       COALESCE((SELECT MAX(position) FROM timeline_pins WHERE user_id = ?), 0),
       COALESCE((SELECT MAX(position) FROM topic_tab_pins WHERE user_id = ?), 0)) AS top`,
    viewerId,
    viewerId
  )
  return Number(row?.top ?? 0) + 1
}

// Pins a list as a Home tab, or takes it off. A pin already there keeps its place.
export async function setTimelinePin(viewerId: string, listId: string, on: boolean, now: number): Promise<void> {
  if (on) {
    if (!await mayPin(listId, viewerId)) return
    await run(
      "INSERT INTO timeline_pins (user_id, list_id, created_at, position) VALUES (?, ?, ?, ?) ON CONFLICT (user_id, list_id) DO NOTHING",
      viewerId,
      listId,
      now,
      await nextPosition(viewerId)
    )
  } else {
    await run("DELETE FROM timeline_pins WHERE user_id = ? AND list_id = ?", viewerId, listId)
  }
}

// Pins a followed topic as a Home tab, or takes it off. The caller checks the topic is followed.
export async function setTopicTabPin(viewerId: string, tag: string, on: boolean, now: number): Promise<void> {
  if (on) {
    await run(
      "INSERT INTO topic_tab_pins (user_id, tag, created_at, position) VALUES (?, ?, ?, ?) ON CONFLICT (user_id, tag) DO NOTHING",
      viewerId,
      tag,
      now,
      await nextPosition(viewerId)
    )
  } else {
    await run("DELETE FROM topic_tab_pins WHERE user_id = ? AND tag = ?", viewerId, tag)
  }
}

// Moves a Home tab one place up (-1) or down (1) among the tabs that show. Hidden tabs keep their slots. Returns false when
// it is already at that end, or is not pinned.
export async function moveHomeTab(viewerId: string, target: HomeTabRef, direction: -1 | 1, now: number): Promise<boolean> {
  const { rows, visible } = await orderedTabs(viewerId, now)
  const shownNow = visible.map(toRef)
  const order = movedOrder(shownNow, target, direction)
  if (!order) return false
  const next = reslot(
    rows.map((row) => row.tab),
    shownNow,
    order
  )
  await transaction(async () => {
    for (const [index, tab] of next.entries()) {
      if (tab.kind === "list") await run("UPDATE timeline_pins SET position = ? WHERE user_id = ? AND list_id = ?", index + 1, viewerId, tab.id)
      else await run("UPDATE topic_tab_pins SET position = ? WHERE user_id = ? AND tag = ?", index + 1, viewerId, tab.tag)
    }
  })
  return true
}

function toRef(tab: PinnedTab): HomeTabRef {
  return tab.kind === "list" ? { kind: "list", id: tab.id } : { kind: "topic", tag: tab.tag }
}
