"use server"

import { revalidatePath } from "next/cache"
import { getAgreedViewer } from "@/lib/auth"
import { hangUpFor } from "@/lib/call-state"
import { get, run, transaction } from "@/lib/db"
import { getProfileByHandle, peopleOfPage, visiblePostIds } from "@/lib/data"
import { notify } from "@/lib/notify"
import { withRequested } from "@/lib/people-state"
import { MINIMUM_AGE } from "@/lib/legal"
import { ageFrom, MAX_BIO, MAX_LOCATION, validateHandle, validateName, validateWebsite } from "@/lib/rules"
import { checkTopic, MAX_FOLLOWED_TOPICS, PEOPLE_PAGE, type PersonEntry } from "@/lib/social-rules"
import { removeUpload, saveUpload } from "@/lib/uploads"
import { consume, waitLabel } from "@/lib/rate-limit"
import { gate, isNewAccount } from "@/lib/risk"

export type FollowResult =
  | { ok: true; state: "following" | "requested" | "none" }
  | { ok: false; error: string; proofRequired?: boolean }

const FOLLOW_HOUR = 60 * 60 * 1000
const FOLLOW_DAY = 24 * FOLLOW_HOUR
export type ProfileState = { ok?: boolean; error?: string }
export type VoidResult = { ok: true } | { ok: false; error: string }
export type TopicResult = { ok: true; following: boolean } | { ok: false; error: string }
export type PeoplePage = { ok: true; users: PersonEntry[]; next: number | null } | { ok: false; error: string }

// A handle is at most 15 characters, so anything much longer than that can't name an account.
const MAX_HANDLE_INPUT = 50

function refresh() {
  revalidatePath("/", "layout")
}

type Account = { id: string; protected: number; deactivated: boolean }

// An account by handle, deactivated ones included. A deactivated account is gone for everyone else, but a viewer must
// still be able to take back their own follow, request, block or mute, so those paths look accounts up this way.
async function accountByHandle(handle: unknown): Promise<Account | undefined> {
  if (typeof handle !== "string") return undefined
  const clean = handle.trim().replace(/^@/, "")
  if (!clean || clean.length > MAX_HANDLE_INPUT) return undefined
  const row = await get<{ id: string; protected: number; deactivated_at: number | null }>(
    "SELECT id, protected, deactivated_at FROM users WHERE handle = ?",
    clean
  )
  return row ? { id: row.id, protected: row.protected, deactivated: row.deactivated_at !== null } : undefined
}

// An account that is still there: not deactivated.
async function activeAccountByHandle(handle: unknown): Promise<Account | undefined> {
  const account = await accountByHandle(handle)
  return account && !account.deactivated ? account : undefined
}

async function blockedEitherWay(a: string, b: string): Promise<boolean> {
  return await get("SELECT 1 AS found FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)", a, b, b, a) !== undefined
}

// The post bell belongs to a follow. When the follow ends, in either direction, the bell goes with it, and following
// again starts without it.
async function dropPostBell(subscriberId: string, authorId: string) {
  await run("DELETE FROM post_subscriptions WHERE user_id = ? AND author_id = ?", subscriberId, authorId)
}

// A follow that began on one of the account's own posts. The post must be theirs, and the viewer must be able to see it,
// so the attribution can't be put on someone else's post. Anything else is ignored, and the follow stands regardless.
async function recordFollowSource(viewerId: string, authorId: string, postId: string | undefined, now: number) {
  if (typeof postId !== "string" || postId.length === 0 || postId.length > 64) return
  const post = await get("SELECT 1 AS found FROM posts WHERE id = ? AND author_id = ? AND is_draft = 0 AND publish_at IS NULL AND removed_at IS NULL", postId, authorId)
  if (!post || !(await visiblePostIds([postId], viewerId)).has(postId)) return
  await run(
    `INSERT INTO follow_sources (follower_id, followee_id, post_id, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (follower_id, followee_id) DO UPDATE SET post_id = excluded.post_id, created_at = excluded.created_at`,
    viewerId,
    authorId,
    postId,
    now
  )
}

// Follows a public account at once. A protected account gets a request it must accept. Pressing again while requested
// withdraws the request. A button that knows what the person asked for sends it as `want`, so a page that has gone stale
// can't flip the opposite way: asking to follow someone you already follow just confirms it. Without `want` it flips.
export async function toggleFollow(handle: string, want?: "follow" | "unfollow", proof?: string, from?: string): Promise<FollowResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in to follow people." }
  if (want !== undefined && want !== "follow" && want !== "unfollow") return { ok: false, error: "Choose follow or unfollow." }
  const target = await accountByHandle(handle)
  if (!target) return { ok: false, error: "That account no longer exists." }
  if (target.id === viewer.id) return { ok: false, error: "You can't follow yourself." }

  // Taking back a follow or a request always works, even if the account has been deactivated or blocked you since.
  const following = await get("SELECT 1 AS found FROM follows WHERE follower_id = ? AND followee_id = ?", viewer.id, target.id)
  if (following) {
    if (want === "follow") return { ok: true, state: "following" }
    await transaction(async () => {
      await run("DELETE FROM follows WHERE follower_id = ? AND followee_id = ?", viewer.id, target.id)
      await run("DELETE FROM follow_sources WHERE follower_id = ? AND followee_id = ?", viewer.id, target.id)
      await dropPostBell(viewer.id, target.id)
      await run("DELETE FROM notifications WHERE actor_id = ? AND recipient_id = ? AND kind = 'follow'", viewer.id, target.id)
    })
    refresh()
    return { ok: true, state: "none" }
  }

  const requested = await get("SELECT 1 AS found FROM follow_requests WHERE requester_id = ? AND target_id = ?", viewer.id, target.id)
  if (requested) {
    if (want === "follow") return { ok: true, state: "requested" }
    await transaction(async () => {
      await run("DELETE FROM follow_requests WHERE requester_id = ? AND target_id = ?", viewer.id, target.id)
      await run("DELETE FROM notifications WHERE actor_id = ? AND recipient_id = ? AND kind = 'follow_request'", viewer.id, target.id)
    })
    refresh()
    return { ok: true, state: "none" }
  }

  if (want === "unfollow") return { ok: true, state: "none" }
  if (target.deactivated) return { ok: false, error: "That account no longer exists." }
  if (await blockedEitherWay(viewer.id, target.id)) return { ok: false, error: "You can't follow this account." }

  // Following is what fake accounts do in bulk, so it passes the account check and the limits below. New accounts have smaller ones.
  const verdict = await gate(viewer.id, proof)
  if (!verdict.ok) return { ok: false, error: verdict.error, proofRequired: verdict.proofRequired }
  const fresh = await isNewAccount(viewer.id)
  const hour = await consume(`follow:${viewer.id}`, fresh ? 20 : 60, FOLLOW_HOUR)
  if (!hour.ok) {
    const why = fresh ? "New accounts can follow fewer people at first. " : ""
    return { ok: false, error: `You're following people too fast. ${why}Try again in ${waitLabel(hour.retryAfterSeconds)}.` }
  }
  const day = await consume(`followday:${viewer.id}`, fresh ? 40 : 300, FOLLOW_DAY)
  if (!day.ok) return { ok: false, error: `You've reached today's limit for following people. Try again in ${waitLabel(day.retryAfterSeconds)}.` }

  if (target.protected === 1) {
    await run("INSERT INTO follow_requests (requester_id, target_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING", viewer.id, target.id, Date.now())
    await notify(target.id, viewer.id, "follow_request", null)
    refresh()
    return { ok: true, state: "requested" }
  }

  const now = Date.now()
  await run("INSERT INTO follows (follower_id, followee_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING", viewer.id, target.id, now)
  await recordFollowSource(viewer.id, target.id, from, now)
  await notify(target.id, viewer.id, "follow", null)
  refresh()
  return { ok: true, state: "following" }
}

export async function acceptFollowRequest(requesterHandle: string): Promise<VoidResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  const requester = await activeAccountByHandle(requesterHandle)
  if (!requester) return { ok: false, error: "That account no longer exists. Decline the request to clear it." }
  const pending = await get("SELECT 1 AS found FROM follow_requests WHERE requester_id = ? AND target_id = ?", requester.id, viewer.id)
  if (!pending) return { ok: false, error: "That request is gone." }
  await transaction(async () => {
    await run("DELETE FROM follow_requests WHERE requester_id = ? AND target_id = ?", requester.id, viewer.id)
    await run("INSERT INTO follows (follower_id, followee_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING", requester.id, viewer.id, Date.now())
    await run("DELETE FROM notifications WHERE actor_id = ? AND recipient_id = ? AND kind = 'follow_request'", requester.id, viewer.id)
  })
  refresh()
  return { ok: true }
}

export async function declineFollowRequest(requesterHandle: string): Promise<VoidResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  // Deactivated accounts count here too, so a request from one can still be cleared.
  const requester = await accountByHandle(requesterHandle)
  if (!requester) return { ok: false, error: "That account no longer exists." }
  await transaction(async () => {
    await run("DELETE FROM follow_requests WHERE requester_id = ? AND target_id = ?", requester.id, viewer.id)
    await run("DELETE FROM notifications WHERE actor_id = ? AND recipient_id = ? AND kind = 'follow_request'", requester.id, viewer.id)
  })
  refresh()
  return { ok: true }
}

export async function removeFollower(handle: string): Promise<VoidResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  const follower = await accountByHandle(handle)
  if (!follower) return { ok: false, error: "That account no longer exists." }
  await transaction(async () => {
    await run("DELETE FROM follows WHERE follower_id = ? AND followee_id = ?", follower.id, viewer.id)
    await run("DELETE FROM follow_sources WHERE follower_id = ? AND followee_id = ?", follower.id, viewer.id)
    await dropPostBell(follower.id, viewer.id)
  })
  refresh()
  return { ok: true }
}

// Blocks or unblocks an account. A button that knows what the person asked for sends it as `want` (true to block, false
// to unblock), so a stale page can't flip the opposite way. Without `want` it flips.
export async function toggleBlock(handle: string, want?: boolean): Promise<VoidResult & { blocked?: boolean }> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  if (want !== undefined && typeof want !== "boolean") return { ok: false, error: "Choose block or unblock." }
  const target = await accountByHandle(handle)
  if (!target) return { ok: false, error: "That account no longer exists." }
  if (target.id === viewer.id) return { ok: false, error: "You can't block yourself." }

  // Unblocking always works, even when the other account has been deactivated since.
  const blocked = await get("SELECT 1 AS found FROM blocks WHERE blocker_id = ? AND blocked_id = ?", viewer.id, target.id)
  if (blocked) {
    if (want === true) return { ok: true, blocked: true }
    await run("DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?", viewer.id, target.id)
    refresh()
    return { ok: true, blocked: false }
  }
  if (want === false) return { ok: true, blocked: false }
  if (target.deactivated) return { ok: false, error: "That account no longer exists." }
  await transaction(async () => {
    await run("INSERT INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING", viewer.id, target.id, Date.now())
    // Blocking cuts every follow, request, post bell and list follow in both directions.
    await run("DELETE FROM follows WHERE (follower_id = ? AND followee_id = ?) OR (follower_id = ? AND followee_id = ?)", viewer.id, target.id, target.id, viewer.id)
    await run("DELETE FROM follow_sources WHERE (follower_id = ? AND followee_id = ?) OR (follower_id = ? AND followee_id = ?)", viewer.id, target.id, target.id, viewer.id)
    await run("DELETE FROM follow_requests WHERE (requester_id = ? AND target_id = ?) OR (requester_id = ? AND target_id = ?)", viewer.id, target.id, target.id, viewer.id)
    await dropPostBell(viewer.id, target.id)
    await dropPostBell(target.id, viewer.id)
    await run("DELETE FROM list_follows WHERE user_id = ? AND list_id IN (SELECT id FROM lists WHERE owner_id = ?)", viewer.id, target.id)
    await run("DELETE FROM list_follows WHERE user_id = ? AND list_id IN (SELECT id FROM lists WHERE owner_id = ?)", target.id, viewer.id)
  })
  // A live call between the two ends now, and so does a group call that has someone either of them blocked.
  await hangUpFor(viewer.id, "blocked")
  await hangUpFor(target.id, "blocked")
  refresh()
  return { ok: true, blocked: true }
}

// Mutes or unmutes an account. `want` works as it does for toggleBlock: true to mute, false to unmute, left out to flip.
export async function toggleMute(handle: string, want?: boolean): Promise<VoidResult & { muted?: boolean }> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  if (want !== undefined && typeof want !== "boolean") return { ok: false, error: "Choose mute or unmute." }
  const target = await accountByHandle(handle)
  if (!target) return { ok: false, error: "That account no longer exists." }
  if (target.id === viewer.id) return { ok: false, error: "You can't mute yourself." }
  // Unmuting always works, even when the other account has been deactivated since.
  const muted = await get("SELECT 1 AS found FROM mutes WHERE muter_id = ? AND muted_id = ?", viewer.id, target.id)
  if (muted) {
    if (want === true) return { ok: true, muted: true }
    await run("DELETE FROM mutes WHERE muter_id = ? AND muted_id = ?", viewer.id, target.id)
    refresh()
    return { ok: true, muted: false }
  }
  if (want === false) return { ok: true, muted: false }
  if (target.deactivated) return { ok: false, error: "That account no longer exists." }
  await run("INSERT INTO mutes (muter_id, muted_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING", viewer.id, target.id, Date.now())
  refresh()
  return { ok: true, muted: true }
}

// Follows or unfollows a topic, and says which it is now. Asking for the state you want (not flipping it) means a stale
// button can't undo what the person meant: following a topic you already follow just confirms it.
export async function setTopicFollow(tag: string, follow: boolean): Promise<TopicResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in to follow topics." }
  const checked = checkTopic(tag)
  if (!checked.ok) return checked
  if (!follow) {
    await run("DELETE FROM topic_follows WHERE user_id = ? AND tag = ?", viewer.id, checked.tag)
    refresh()
    return { ok: true, following: false }
  }
  const already = await get("SELECT 1 AS found FROM topic_follows WHERE user_id = ? AND tag = ?", viewer.id, checked.tag)
  if (!already) {
    const count = (await get<{ c: number }>("SELECT COUNT(*) AS c FROM topic_follows WHERE user_id = ?", viewer.id))?.c ?? 0
    if (count >= MAX_FOLLOWED_TOPICS) {
      return { ok: false, error: `You can follow up to ${MAX_FOLLOWED_TOPICS} topics. Unfollow one to follow another.` }
    }
    await run("INSERT INTO topic_follows (user_id, tag, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING", viewer.id, checked.tag, Date.now())
  }
  refresh()
  return { ok: true, following: true }
}

// The next page of an account's followers or following, newest first. It applies the same rules as the page: a protected
// account only shows its lists to the owner and to people who follow it.
export async function loadMorePeople(handle: string, kind: "followers" | "following", before: number): Promise<PeoplePage> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  if (kind !== "followers" && kind !== "following") return { ok: false, error: "Pick followers or following." }
  if (typeof before !== "number" || !Number.isFinite(before)) return { ok: false, error: "Couldn't load more people. Reload the page and try again." }
  if (typeof handle !== "string" || !handle || handle.length > MAX_HANDLE_INPUT) return { ok: false, error: "That account doesn't exist." }
  const profile = await getProfileByHandle(handle, viewer.id)
  const isSelf = profile?.id === viewer.id
  if (!profile || (profile.deactivated && !isSelf) || profile.relationship.blockedMe) return { ok: false, error: "That account doesn't exist." }
  if (profile.protected && !isSelf && !profile.relationship.following) {
    return { ok: false, error: `This account is protected. Follow it to see ${kind === "followers" ? "who follows it" : "who it follows"}.` }
  }
  const page = await peopleOfPage(kind, profile.id, viewer.id, before, PEOPLE_PAGE)
  return { ok: true, users: await withRequested(viewer.id, page.users), next: page.next }
}

// Protecting an account means new followers need approval. Making it public again clears the requests still waiting, since
// there is nothing left for them to decide; the result says how many.
// Hides or shows the counts on the viewer's own posts, for everyone except the viewer.
export async function setHideCounts(hide: boolean): Promise<VoidResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  if (typeof hide !== "boolean") return { ok: false, error: "Choose whether counts are hidden." }
  await run("UPDATE users SET hide_counts = ? WHERE id = ?", hide ? 1 : 0, viewer.id)
  revalidatePath("/", "layout")
  return { ok: true }
}

export async function setProtected(protectedAccount: boolean): Promise<VoidResult & { cleared?: number }> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  if (typeof protectedAccount !== "boolean") return { ok: false, error: "Choose whether your posts are protected." }
  let cleared = 0
  await transaction(async () => {
    await run("UPDATE users SET protected = ? WHERE id = ?", protectedAccount ? 1 : 0, viewer.id)
    if (!protectedAccount) {
      cleared = (await get<{ c: number }>("SELECT COUNT(*) AS c FROM follow_requests WHERE target_id = ?", viewer.id))?.c ?? 0
      await run("DELETE FROM follow_requests WHERE target_id = ?", viewer.id)
      await run("DELETE FROM notifications WHERE recipient_id = ? AND kind = 'follow_request'", viewer.id)
    }
  })
  refresh()
  return { ok: true, cleared }
}

export async function changeHandle(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { error: "Sign in first." }
  const handle = String(formData.get("handle") ?? "").trim()
  const error = validateHandle(handle)
  if (error) return { error }
  if (handle.toLowerCase() === viewer.handle.toLowerCase()) {
    await run("UPDATE users SET handle = ? WHERE id = ?", handle, viewer.id)
    refresh()
    return { ok: true }
  }
  if (await get("SELECT id FROM users WHERE handle = ?", handle)) return { error: "That handle is taken." }
  await run("UPDATE users SET handle = ? WHERE id = ?", handle, viewer.id)
  refresh()
  return { ok: true }
}

export async function updateBirthday(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { error: "Sign in first." }
  const birthday = String(formData.get("birthday") ?? "").trim()
  const age = ageFrom(birthday)
  if (age === null) return { error: "Enter a valid date." }
  if (age < MINIMUM_AGE) return { error: `You must be ${MINIMUM_AGE} or older to use Rhenko.` }
  await run("UPDATE users SET birthday = ? WHERE id = ?", birthday, viewer.id)
  refresh()
  return { ok: true }
}

export async function updateProfile(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { error: "Sign in to edit your profile." }

  const name = String(formData.get("name") ?? "").trim()
  const bio = String(formData.get("bio") ?? "").trim()
  // Location and website belong to About you, so this form changes them only when it sends them.
  const sendsLocation = formData.has("location")
  const sendsWebsite = formData.has("website")
  const location = String(formData.get("location") ?? "").trim()
  const website = String(formData.get("website") ?? "").trim()

  const nameError = validateName(name)
  if (nameError) return { error: nameError }
  if ([...bio].length > MAX_BIO) return { error: `Bios can have up to ${MAX_BIO} characters.` }
  if (sendsLocation && [...location].length > MAX_LOCATION) return { error: `Locations can have up to ${MAX_LOCATION} characters.` }
  if (sendsWebsite) {
    const websiteError = validateWebsite(website)
    if (websiteError) return { error: websiteError }
  }

  const avatar = formData.get("avatar")
  const banner = formData.get("banner")
  const avatarUpload = avatar instanceof File && avatar.size > 0 ? await saveUpload(avatar, "image") : null
  if (avatarUpload && !avatarUpload.ok) return { error: avatarUpload.error }
  const bannerUpload = banner instanceof File && banner.size > 0 ? await saveUpload(banner, "image") : null
  if (bannerUpload && !bannerUpload.ok) {
    if (avatarUpload?.ok) await removeUpload(avatarUpload.name)
    return { error: bannerUpload.error }
  }

  const previous = await get<{ avatar_file: string | null; banner_file: string | null; location: string | null; website: string | null }>(
    "SELECT avatar_file, banner_file, location, website FROM users WHERE id = ?",
    viewer.id
  )
  await run(
    `UPDATE users SET name = ?, bio = ?, location = ?, website = ?,
       avatar_file = COALESCE(?, avatar_file), banner_file = COALESCE(?, banner_file)
     WHERE id = ?`,
    name,
    bio,
    sendsLocation ? location : (previous?.location ?? ""),
    sendsWebsite ? website : (previous?.website ?? ""),
    avatarUpload?.ok ? avatarUpload.name : null,
    bannerUpload?.ok ? bannerUpload.name : null,
    viewer.id
  )
  if (avatarUpload?.ok) await removeUpload(previous?.avatar_file ?? null)
  if (bannerUpload?.ok) await removeUpload(previous?.banner_file ?? null)
  refresh()
  return { ok: true }
}

// About you: where someone is and their website. Both are shown on the About page, and both can be left empty.
export async function saveAbout(input: { location: string; website: string }): Promise<VoidResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in to edit your details." }
  const location = typeof input.location === "string" ? input.location.trim() : ""
  const website = typeof input.website === "string" ? input.website.trim() : ""
  if ([...location].length > MAX_LOCATION) return { ok: false, error: `Locations can have up to ${MAX_LOCATION} characters.` }
  const websiteError = validateWebsite(website)
  if (websiteError) return { ok: false, error: websiteError }
  await run("UPDATE users SET location = ?, website = ? WHERE id = ?", location, website, viewer.id)
  refresh()
  return { ok: true }
}

// Post notifications: an alert for every new post from an account you follow.
export async function togglePostNotifications(handle: string): Promise<VoidResult & { notifying?: boolean }> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  const target = await accountByHandle(handle)
  if (!target) return { ok: false, error: "That account no longer exists." }
  if (target.id === viewer.id) return { ok: false, error: "You can't turn on notifications for yourself." }

  // Turning the bell off always works.
  const existing = await get("SELECT 1 AS found FROM post_subscriptions WHERE user_id = ? AND author_id = ?", viewer.id, target.id)
  if (existing) {
    await dropPostBell(viewer.id, target.id)
    refresh()
    return { ok: true, notifying: false }
  }
  if (target.deactivated) return { ok: false, error: "That account no longer exists." }
  const following = await get("SELECT 1 AS found FROM follows WHERE follower_id = ? AND followee_id = ?", viewer.id, target.id)
  if (!following) return { ok: false, error: `Follow @${String(handle).replace(/^@/, "")} first, then turn on post notifications.` }
  await run("INSERT INTO post_subscriptions (user_id, author_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING", viewer.id, target.id, Date.now())
  refresh()
  return { ok: true, notifying: true }
}
