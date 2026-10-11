"use server"

import { revalidatePath } from "next/cache"
import { getViewer } from "@/lib/auth"
import { get, run } from "@/lib/db"
import { notify } from "@/lib/notify"
import { MAX_BIO, MAX_LOCATION, validateName, validateWebsite } from "@/lib/rules"
import { removeUpload, saveUpload } from "@/lib/uploads"

export type FollowResult = { ok: true; following: boolean } | { ok: false; error: string }
export type ProfileState = { ok?: boolean; error?: string }

function refresh() {
  revalidatePath("/", "layout")
}

export async function toggleFollow(handle: string): Promise<FollowResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in to follow people." }
  const target = get<{ id: string }>("SELECT id FROM users WHERE handle = ? COLLATE NOCASE", handle)
  if (!target) return { ok: false, error: "That account no longer exists." }
  if (target.id === viewer.id) return { ok: false, error: "You cannot follow yourself." }

  const existing = get("SELECT 1 AS found FROM follows WHERE follower_id = ? AND followee_id = ?", viewer.id, target.id)
  if (existing) {
    run("DELETE FROM follows WHERE follower_id = ? AND followee_id = ?", viewer.id, target.id)
    run("DELETE FROM notifications WHERE actor_id = ? AND recipient_id = ? AND kind = 'follow'", viewer.id, target.id)
    refresh()
    return { ok: true, following: false }
  }
  run("INSERT INTO follows (follower_id, followee_id, created_at) VALUES (?, ?, ?)", viewer.id, target.id, Date.now())
  notify(target.id, viewer.id, "follow", null)
  refresh()
  return { ok: true, following: true }
}

export async function updateProfile(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const viewer = await getViewer()
  if (!viewer) return { error: "Sign in to edit your profile." }

  const name = String(formData.get("name") ?? "").trim()
  const bio = String(formData.get("bio") ?? "").trim()
  const location = String(formData.get("location") ?? "").trim()
  const website = String(formData.get("website") ?? "").trim()

  const nameError = validateName(name)
  if (nameError) return { error: nameError }
  if ([...bio].length > MAX_BIO) return { error: `Bios can have up to ${MAX_BIO} characters.` }
  if ([...location].length > MAX_LOCATION) return { error: `Locations can have up to ${MAX_LOCATION} characters.` }
  const websiteError = validateWebsite(website)
  if (websiteError) return { error: websiteError }

  const avatar = formData.get("avatar")
  const banner = formData.get("banner")
  const avatarUpload = avatar instanceof File && avatar.size > 0 ? await saveUpload(avatar) : null
  if (avatarUpload && !avatarUpload.ok) return { error: avatarUpload.error }
  const bannerUpload = banner instanceof File && banner.size > 0 ? await saveUpload(banner) : null
  if (bannerUpload && !bannerUpload.ok) {
    if (avatarUpload?.ok) removeUpload(avatarUpload.name)
    return { error: bannerUpload.error }
  }

  const previous = get<{ avatar_file: string | null; banner_file: string | null }>(
    "SELECT avatar_file, banner_file FROM users WHERE id = ?",
    viewer.id
  )
  run(
    `UPDATE users SET name = ?, bio = ?, location = ?, website = ?,
       avatar_file = COALESCE(?, avatar_file), banner_file = COALESCE(?, banner_file)
     WHERE id = ?`,
    name,
    bio,
    location,
    website,
    avatarUpload?.ok ? avatarUpload.name : null,
    bannerUpload?.ok ? bannerUpload.name : null,
    viewer.id
  )
  if (avatarUpload?.ok) removeUpload(previous?.avatar_file ?? null)
  if (bannerUpload?.ok) removeUpload(previous?.banner_file ?? null)
  refresh()
  return { ok: true }
}
