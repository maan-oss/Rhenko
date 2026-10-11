"use server"

import { revalidatePath } from "next/cache"
import { getViewer, newId } from "@/lib/auth"
import { get, run } from "@/lib/db"
import { blockedEitherWay } from "@/lib/notify"
import { MAX_LIST_DESCRIPTION, MAX_LIST_NAME } from "@/lib/rules"

export type ListResult = { ok: true; id: string } | { ok: false; error: string }
export type VoidResult = { ok: true } | { ok: false; error: string }
export type FollowListResult = { ok: true; following: boolean } | { ok: false; error: string }

function refresh() {
  revalidatePath("/", "layout")
}

function ownedList(listId: string, userId: string): boolean {
  return get("SELECT 1 AS found FROM lists WHERE id = ? AND owner_id = ?", listId, userId) !== undefined
}

export async function createList(formData: FormData): Promise<ListResult> {
  const viewer = await getViewer()
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
  run(
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
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  if (!ownedList(listId, viewer.id)) return { ok: false, error: "Only the owner can delete this list." }
  run("DELETE FROM lists WHERE id = ?", listId)
  refresh()
  return { ok: true }
}

export async function addListMember(listId: string, handle: string): Promise<VoidResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  if (!ownedList(listId, viewer.id)) return { ok: false, error: "Only the owner can change this list." }
  const clean = handle.trim().replace(/^@/, "")
  const target = get<{ id: string }>("SELECT id FROM users WHERE handle = ? COLLATE NOCASE AND deactivated_at IS NULL", clean)
  if (!target) return { ok: false, error: `@${clean} doesn't exist.` }
  if (blockedEitherWay(viewer.id, target.id)) return { ok: false, error: `You can't add @${clean}.` }
  run("INSERT OR IGNORE INTO list_members (list_id, user_id, created_at) VALUES (?, ?, ?)", listId, target.id, Date.now())
  refresh()
  return { ok: true }
}

export async function removeListMember(listId: string, userId: string): Promise<VoidResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  if (!ownedList(listId, viewer.id)) return { ok: false, error: "Only the owner can change this list." }
  run("DELETE FROM list_members WHERE list_id = ? AND user_id = ?", listId, userId)
  refresh()
  return { ok: true }
}

// Following a list adds it to your lists tab. Private lists stay with their owner.
export async function toggleListFollow(listId: string): Promise<FollowListResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in to follow lists." }
  const list = get<{ owner_id: string; private: number }>("SELECT owner_id, private FROM lists WHERE id = ?", listId)
  if (!list) return { ok: false, error: "That list no longer exists." }
  if (list.owner_id === viewer.id) return { ok: false, error: "You already own this list." }
  if (list.private === 1) return { ok: false, error: "Private lists can't be followed." }
  const followed = get("SELECT 1 AS found FROM list_follows WHERE list_id = ? AND user_id = ?", listId, viewer.id)
  if (followed) {
    run("DELETE FROM list_follows WHERE list_id = ? AND user_id = ?", listId, viewer.id)
    refresh()
    return { ok: true, following: false }
  }
  run("INSERT OR IGNORE INTO list_follows (list_id, user_id, created_at) VALUES (?, ?, ?)", listId, viewer.id, Date.now())
  refresh()
  return { ok: true, following: true }
}
