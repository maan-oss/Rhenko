"use server"

import { revalidatePath } from "next/cache"
import { getViewer, newId } from "@/lib/auth"
import { get, run } from "@/lib/db"
import { MAX_COMMUNITY_DESCRIPTION, MAX_COMMUNITY_NAME } from "@/lib/rules"

export type IdResult = { ok: true; id: string } | { ok: false; error: string }
export type MembershipResult = { ok: true; joined: boolean } | { ok: false; error: string }
export type VoidResult = { ok: true } | { ok: false; error: string }

function refresh() {
  revalidatePath("/", "layout")
}

export async function createCommunity(formData: FormData): Promise<IdResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in to start a community." }
  const name = String(formData.get("name") ?? "").trim()
  if (!name) return { ok: false, error: "Give the community a name." }
  if ([...name].length > MAX_COMMUNITY_NAME) return { ok: false, error: `Names can have up to ${MAX_COMMUNITY_NAME} characters.` }
  const description = String(formData.get("description") ?? "").trim()
  if ([...description].length > MAX_COMMUNITY_DESCRIPTION) {
    return { ok: false, error: `Descriptions can have up to ${MAX_COMMUNITY_DESCRIPTION} characters.` }
  }
  const id = newId()
  const now = Date.now()
  run("INSERT INTO communities (id, name, description, owner_id, created_at) VALUES (?, ?, ?, ?, ?)", id, name, description, viewer.id, now)
  run("INSERT INTO community_members (community_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)", id, viewer.id, now)
  refresh()
  return { ok: true, id }
}

// Joins or leaves. Owners delete the community instead of leaving it.
export async function toggleCommunityMembership(communityId: string): Promise<MembershipResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in to join communities." }
  const exists = get("SELECT 1 AS found FROM communities WHERE id = ?", communityId)
  if (!exists) return { ok: false, error: "That community no longer exists." }
  const member = get<{ role: string }>("SELECT role FROM community_members WHERE community_id = ? AND user_id = ?", communityId, viewer.id)
  if (member) {
    if (member.role === "owner") return { ok: false, error: "Owners can't leave. Delete the community instead." }
    run("DELETE FROM community_members WHERE community_id = ? AND user_id = ?", communityId, viewer.id)
    refresh()
    return { ok: true, joined: false }
  }
  run("INSERT INTO community_members (community_id, user_id, role, created_at) VALUES (?, ?, 'member', ?)", communityId, viewer.id, Date.now())
  refresh()
  return { ok: true, joined: true }
}

export async function deleteCommunity(communityId: string): Promise<VoidResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  const owner = get("SELECT 1 AS found FROM communities WHERE id = ? AND owner_id = ?", communityId, viewer.id)
  if (!owner) return { ok: false, error: "Only the owner can delete this community." }
  run("DELETE FROM communities WHERE id = ?", communityId)
  refresh()
  return { ok: true }
}
