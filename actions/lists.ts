"use server"

import { revalidatePath } from "next/cache"
import { toggleFollow } from "@/actions/social"
import { getAgreedViewer, newId } from "@/lib/auth"
import { all, get, run } from "@/lib/db"
import { blockedEitherWay } from "@/lib/notify"
import { isTimelinePinned, mayPin, setTimelinePin as storeTimelinePin, timelinePinCount } from "@/lib/timelines"
import { MAX_LIST_DESCRIPTION, MAX_LIST_NAME, MAX_PACK_FOLLOWS, MAX_TIMELINE_PINS } from "@/lib/rules"

export type ListResult = { ok: true; id: string } | { ok: false; error: string }
export type VoidResult = { ok: true } | { ok: false; error: string }
export type FollowListResult = { ok: true; following: boolean } | { ok: false; error: string }

// A handle is at most 15 characters, so anything much longer than that can't name an account.
const MAX_HANDLE_INPUT = 50

function refresh() {
  revalidatePath("/", "layout")
}

async function ownedList(listId: unknown, userId: string): Promise<boolean> {
  if (typeof listId !== "string") return false
  return await get("SELECT 1 AS found FROM lists WHERE id = ? AND owner_id = ?", listId, userId) !== undefined
}

export async function createList(formData: FormData): Promise<ListResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in to make a list." }
  const name = String(formData.get("name") ?? "").trim()
  if (!name) return { ok: false, error: "Give the list a name." }
  if ([...name].length > MAX_LIST_NAME) return { ok: false, error: `List names can have up to ${MAX_LIST_NAME} characters.` }
  const description = String(formData.get("description") ?? "").trim()
  if ([...description].length > MAX_LIST_DESCRIPTION) {
    return { ok: false, error: `Descriptions can have up to ${MAX_LIST_DESCRIPTION} characters.` }
  }
  const isPrivate = formData.get("private") === "on" ? 1 : 0
  const id = newId()
  await run(
    "INSERT INTO lists (id, owner_id, name, description, private, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    id,
    viewer.id,
    name,
    description,
    isPrivate,
    Date.now()
  )
  refresh()
  return { ok: true, id }
}

export async function deleteList(listId: string): Promise<VoidResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  if (!await ownedList(listId, viewer.id)) return { ok: false, error: "Only the owner can delete this list." }
  await run("DELETE FROM lists WHERE id = ?", listId)
  refresh()
  return { ok: true }
}

export async function addListMember(listId: string, handle: string): Promise<VoidResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  if (!await ownedList(listId, viewer.id)) return { ok: false, error: "Only the owner can change this list." }
  const clean = typeof handle === "string" ? handle.trim().replace(/^@/, "").slice(0, MAX_HANDLE_INPUT) : ""
  if (!clean) return { ok: false, error: "Enter the handle of the person to add." }
  const target = await get<{ id: string; handle: string }>(
    "SELECT id, handle FROM users WHERE handle = ? AND deactivated_at IS NULL",
    clean
  )
  if (!target) return { ok: false, error: `@${clean} doesn't exist.` }
  if (await blockedEitherWay(viewer.id, target.id)) return { ok: false, error: `You can't add @${target.handle}.` }
  if (await get("SELECT 1 AS found FROM list_members WHERE list_id = ? AND user_id = ?", listId, target.id)) {
    return { ok: false, error: `@${target.handle} is already on this list.` }
  }
  await run("INSERT INTO list_members (list_id, user_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING", listId, target.id, Date.now())
  refresh()
  return { ok: true }
}

export async function removeListMember(listId: string, userId: string): Promise<VoidResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  if (!await ownedList(listId, viewer.id)) return { ok: false, error: "Only the owner can change this list." }
  if (typeof userId !== "string" || !userId) return { ok: false, error: "Choose who to remove." }
  await run("DELETE FROM list_members WHERE list_id = ? AND user_id = ?", listId, userId)
  refresh()
  return { ok: true }
}

// Following a list adds it to your lists tab. Private lists stay with their owner. A button that knows what the person
// asked for sends it as `want` (true to follow, false to stop), so a stale page can't flip the opposite way. Without
// `want` it flips.
export async function toggleListFollow(listId: string, want?: boolean): Promise<FollowListResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in to follow lists." }
  if (typeof listId !== "string") return { ok: false, error: "That list no longer exists." }
  if (want !== undefined && typeof want !== "boolean") return { ok: false, error: "Choose follow or unfollow." }
  const list = await get<{ owner_id: string; private: number }>("SELECT owner_id, private FROM lists WHERE id = ?", listId)
  if (!list) return { ok: false, error: "That list no longer exists." }
  if (list.owner_id === viewer.id) return { ok: false, error: "You already own this list." }
  const followed = await get("SELECT 1 AS found FROM list_follows WHERE list_id = ? AND user_id = ?", listId, viewer.id)
  // Unfollowing always works. Following needs a public list, the owner not to have blocked you, and you not to have blocked them.
  if (followed) {
    if (want === true) return { ok: true, following: true }
    await run("DELETE FROM list_follows WHERE list_id = ? AND user_id = ?", listId, viewer.id)
    refresh()
    return { ok: true, following: false }
  }
  if (want === false) return { ok: true, following: false }
  if (list.private === 1) return { ok: false, error: "Private lists can't be followed." }
  if (await blockedEitherWay(viewer.id, list.owner_id)) return { ok: false, error: "You can't follow this list." }
  await run("INSERT INTO list_follows (list_id, user_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING", listId, viewer.id, Date.now())
  refresh()
  return { ok: true, following: true }
}

// Publishes a public list as a starter pack, or takes it back. A pack needs people on it, so it can be found and followed.
export async function setStarterPack(listId: string, on: boolean): Promise<VoidResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  if (!await ownedList(listId, viewer.id)) return { ok: false, error: "Only the owner can change this list." }
  if (on) {
    const list = await get<{ private: number }>("SELECT private FROM lists WHERE id = ?", listId)
    if (list?.private === 1) return { ok: false, error: "Only public lists can be starter packs." }
    const members = (await get<{ c: number }>("SELECT COUNT(*) AS c FROM list_members WHERE list_id = ?", listId))?.c ?? 0
    if (members === 0) return { ok: false, error: "Add people to the list before you publish it as a starter pack." }
  }
  await run("UPDATE lists SET starter = ? WHERE id = ?", on ? 1 : 0, listId)
  refresh()
  return { ok: true }
}

export type FollowPackResult = { ok: true; following: number; total: number; stopped: string | null } | { ok: false; error: string }

// The errors that are about one account, not about the viewer. A pack skips those people and carries on.
const PER_ACCOUNT_ERROR = [/no longer exists/, /can't follow this account/]

// Follows everyone in a starter pack, up to MAX_PACK_FOLLOWS people. Each follow passes the same checks as following
// one person. When a check that concerns the viewer runs out, the rest waits, and `stopped` says why.
export async function followStarterPack(listId: string): Promise<FollowPackResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in to follow people." }
  if (typeof listId !== "string") return { ok: false, error: "That starter pack no longer exists." }
  const list = await get<{ owner_id: string; starter: number; private: number }>("SELECT owner_id, starter, private FROM lists WHERE id = ?", listId)
  if (!list || list.starter !== 1 || list.private === 1) return { ok: false, error: "That starter pack no longer exists." }
  if (await blockedEitherWay(viewer.id, list.owner_id)) return { ok: false, error: "You can't follow this starter pack." }
  const members = await all<{ handle: string }>(
    `SELECT u.handle FROM list_members m JOIN users u ON u.id = m.user_id
     WHERE m.list_id = ? AND u.id <> ? AND u.deactivated_at IS NULL
     ORDER BY m.created_at DESC LIMIT ?`,
    listId,
    viewer.id,
    MAX_PACK_FOLLOWS
  )
  let following = 0
  let stopped: string | null = null
  for (const member of members) {
    const result = await toggleFollow(member.handle, "follow")
    if (result.ok) {
      if (result.state === "following" || result.state === "requested") following++
      continue
    }
    if (!result.proofRequired && PER_ACCOUNT_ERROR.some((pattern) => pattern.test(result.error))) continue
    stopped = result.error
    break
  }
  return { ok: true, following, total: members.length, stopped }
}

// Pins a list as a tab on Home, or takes it off. Only lists the viewer can open can be pinned, up to MAX_TIMELINE_PINS.
export async function setTimelinePin(listId: string, on: boolean): Promise<VoidResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in to pin lists to Home." }
  if (typeof listId !== "string") return { ok: false, error: "That list no longer exists." }
  if (on) {
    if (!await mayPin(listId, viewer.id)) return { ok: false, error: "Follow this list before you pin it to Home." }
    if (!await isTimelinePinned(viewer.id, listId) && await timelinePinCount(viewer.id) >= MAX_TIMELINE_PINS) {
      return { ok: false, error: `Home holds up to ${MAX_TIMELINE_PINS} pinned lists. Unpin one to add another.` }
    }
  }
  await storeTimelinePin(viewer.id, listId, on, Date.now())
  refresh()
  return { ok: true }
}
