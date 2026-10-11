"use server"

import { revalidatePath } from "next/cache"
import { getViewer } from "@/lib/auth"
import { get, run, transaction } from "@/lib/db"
import { notify } from "@/lib/notify"
import { ageFrom, MAX_BIO, MAX_LOCATION, validateHandle, validateName, validateWebsite } from "@/lib/rules"
import { removeUpload, saveUpload } from "@/lib/uploads"

export type FollowResult = { ok: true; state: "following" | "requested" | "none" } | { ok: false; error: string }
export type ProfileState = { ok?: boolean; error?: string }
export type VoidResult = { ok: true } | { ok: false; error: string }

function refresh() {
  revalidatePath("/", "layout")
}

function userByHandle(handle: string): { id: string; protected: number } | undefined {
  return get<{ id: string; protected: number }>("SELECT id, protected FROM users WHERE handle = ? COLLATE NOCASE AND deactivated_at IS NULL", handle)
}

function blockedEitherWay(a: string, b: string): boolean {
  return get("SELECT 1 AS found FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)", a, b, b, a) !== undefined
}

// Follows a public account at once. A protected account gets a request it
// must accept. Pressing again while requested withdraws the request.
export async function toggleFollow(handle: string): Promise<FollowResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in to follow people." }
  const target = userByHandle(handle)
  if (!target) return { ok: false, error: "That account no longer exists." }
  if (target.id === viewer.id) return { ok: false, error: "You can't follow yourself." }
  if (blockedEitherWay(viewer.id, target.id)) return { ok: false, error: "You can't follow this account." }

  const following = get("SELECT 1 AS found FROM follows WHERE follower_id = ? AND followee_id = ?", viewer.id, target.id)
  if (following) {
    run("DELETE FROM follows WHERE follower_id = ? AND followee_id = ?", viewer.id, target.id)
    run("DELETE FROM notifications WHERE actor_id = ? AND recipient_id = ? AND kind = 'follow'", viewer.id, target.id)
    refresh()
    return { ok: true, state: "none" }
  }

  const requested = get("SELECT 1 AS found FROM follow_requests WHERE requester_id = ? AND target_id = ?", viewer.id, target.id)
  if (requested) {
    run("DELETE FROM follow_requests WHERE requester_id = ? AND target_id = ?", viewer.id, target.id)
    run("DELETE FROM notifications WHERE actor_id = ? AND recipient_id = ? AND kind = 'follow_request'", viewer.id, target.id)
    refresh()
    return { ok: true, state: "none" }
  }

  if (target.protected === 1) {
    run("INSERT INTO follow_requests (requester_id, target_id, created_at) VALUES (?, ?, ?)", viewer.id, target.id, Date.now())
    notify(target.id, viewer.id, "follow_request", null)
    refresh()
    return { ok: true, state: "requested" }
  }

  run("INSERT INTO follows (follower_id, followee_id, created_at) VALUES (?, ?, ?)", viewer.id, target.id, Date.now())
  notify(target.id, viewer.id, "follow", null)
  refresh()
  return { ok: true, state: "following" }
}

export async function acceptFollowRequest(requesterHandle: string): Promise<VoidResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  const requester = userByHandle(requesterHandle)
  if (!requester) return { ok: false, error: "That account no longer exists." }
  const pending = get("SELECT 1 AS found FROM follow_requests WHERE requester_id = ? AND target_id = ?", requester.id, viewer.id)
  if (!pending) return { ok: false, error: "That request is gone." }
  transaction(() => {
    run("DELETE FROM follow_requests WHERE requester_id = ? AND target_id = ?", requester.id, viewer.id)
    run("INSERT OR IGNORE INTO follows (follower_id, followee_id, created_at) VALUES (?, ?, ?)", requester.id, viewer.id, Date.now())
    run("DELETE FROM notifications WHERE actor_id = ? AND recipient_id = ? AND kind = 'follow_request'", requester.id, viewer.id)
  })
  notify(requester.id, viewer.id, "follow", null)
  refresh()
  return { ok: true }
}

export async function declineFollowRequest(requesterHandle: string): Promise<VoidResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  const requester = userByHandle(requesterHandle)
  if (requester) {
    run("DELETE FROM follow_requests WHERE requester_id = ? AND target_id = ?", requester.id, viewer.id)
    run("DELETE FROM notifications WHERE actor_id = ? AND recipient_id = ? AND kind = 'follow_request'", requester.id, viewer.id)
  }
  refresh()
  return { ok: true }
}

export async function removeFollower(handle: string): Promise<VoidResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  const follower = userByHandle(handle)
  if (follower) run("DELETE FROM follows WHERE follower_id = ? AND followee_id = ?", follower.id, viewer.id)
  refresh()
  return { ok: true }
}

export async function toggleBlock(handle: string): Promise<VoidResult & { blocked?: boolean }> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  const target = userByHandle(handle)
  if (!target) return { ok: false, error: "That account no longer exists." }
  if (target.id === viewer.id) return { ok: false, error: "You can't block yourself." }

  const blocked = get("SELECT 1 AS found FROM blocks WHERE blocker_id = ? AND blocked_id = ?", viewer.id, target.id)
  if (blocked) {
    run("DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?", viewer.id, target.id)
    refresh()
    return { ok: true, blocked: false }
  }
  transaction(() => {
    run("INSERT INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)", viewer.id, target.id, Date.now())
    // Blocking cuts every follow and request in both directions.
    run("DELETE FROM follows WHERE (follower_id = ? AND followee_id = ?) OR (follower_id = ? AND followee_id = ?)", viewer.id, target.id, target.id, viewer.id)
    run("DELETE FROM follow_requests WHERE (requester_id = ? AND target_id = ?) OR (requester_id = ? AND target_id = ?)", viewer.id, target.id, target.id, viewer.id)
  })
  refresh()
  return { ok: true, blocked: true }
}

export async function toggleMute(handle: string): Promise<VoidResult & { muted?: boolean }> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  const target = userByHandle(handle)
  if (!target) return { ok: false, error: "That account no longer exists." }
  if (target.id === viewer.id) return { ok: false, error: "You can't mute yourself." }
  const muted = get("SELECT 1 AS found FROM mutes WHERE muter_id = ? AND muted_id = ?", viewer.id, target.id)
  if (muted) {
    run("DELETE FROM mutes WHERE muter_id = ? AND muted_id = ?", viewer.id, target.id)
    refresh()
    return { ok: true, muted: false }
  }
  run("INSERT INTO mutes (muter_id, muted_id, created_at) VALUES (?, ?, ?)", viewer.id, target.id, Date.now())
  refresh()
  return { ok: true, muted: true }
}

export async function toggleTopicFollow(tag: string): Promise<VoidResult & { following?: boolean }> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in to follow topics." }
  const clean = tag.replace(/^#/, "").toLowerCase()
  if (!clean) return { ok: false, error: "Pick a topic." }
  const existing = get("SELECT 1 AS found FROM topic_follows WHERE user_id = ? AND tag = ?", viewer.id, clean)
  if (existing) {
    run("DELETE FROM topic_follows WHERE user_id = ? AND tag = ?", viewer.id, clean)
    refresh()
    return { ok: true, following: false }
  }
  run("INSERT INTO topic_follows (user_id, tag, created_at) VALUES (?, ?, ?)", viewer.id, clean, Date.now())
  refresh()
  return { ok: true, following: true }
}

export async function setProtected(protectedAccount: boolean): Promise<VoidResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  run("UPDATE users SET protected = ? WHERE id = ?", protectedAccount ? 1 : 0, viewer.id)
  if (!protectedAccount) {
    // Pending requests have nothing to decide once the account is public.
    run("DELETE FROM follow_requests WHERE target_id = ?", viewer.id)
  }
  refresh()
  return { ok: true }
}

export async function changeHandle(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const viewer = await getViewer()
  if (!viewer) return { error: "Sign in first." }
  const handle = String(formData.get("handle") ?? "").trim()
  const error = validateHandle(handle)
  if (error) return { error }
  if (handle.toLowerCase() === viewer.handle.toLowerCase()) {
    run("UPDATE users SET handle = ? WHERE id = ?", handle, viewer.id)
    refresh()
    return { ok: true }
  }
  if (get("SELECT id FROM users WHERE handle = ? COLLATE NOCASE", handle)) return { error: "That handle is taken." }
  run("UPDATE users SET handle = ? WHERE id = ?", handle, viewer.id)
  refresh()
  return { ok: true }
}

export async function updateBirthday(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const viewer = await getViewer()
  if (!viewer) return { error: "Sign in first." }
  const birthday = String(formData.get("birthday") ?? "").trim()
  const age = ageFrom(birthday)
  if (age === null) return { error: "Enter a valid date." }
  if (age < 13) return { error: "You must be at least 13 to use Rhenko." }
  run("UPDATE users SET birthday = ? WHERE id = ?", birthday, viewer.id)
  refresh()
  return { ok: true }
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
  const avatarUpload = avatar instanceof File && avatar.size > 0 ? await saveUpload(avatar, "image") : null
  if (avatarUpload && !avatarUpload.ok) return { error: avatarUpload.error }
  const bannerUpload = banner instanceof File && banner.size > 0 ? await saveUpload(banner, "image") : null
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
