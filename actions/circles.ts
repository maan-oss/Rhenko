"use server"

import { revalidatePath } from "next/cache"
import { getAgreedViewer, newId } from "@/lib/auth"
import { get, run, transaction } from "@/lib/db"
import { closeCircle, isOwner, memberRole, uniqueSlug } from "@/lib/circles"
import { blockedEitherWay } from "@/lib/notify"
import { removeFiles } from "@/lib/post-writes"
import { consume, waitLabel } from "@/lib/rate-limit"
import {
  asCircleAccess,
  MAX_CIRCLE_ANSWER,
  MAX_CIRCLE_CHARTER,
  MAX_CIRCLE_NAME,
  MAX_CIRCLE_QUESTION,
  MAX_CIRCLE_TAGLINE,
  type CircleAccess,
} from "@/lib/rules"

export type CircleResult = { ok: true; slug: string } | { ok: false; error: string }
export type JoinResult = { ok: true; state: "joined" | "requested" } | { ok: false; error: string }
export type VoidResult = { ok: true } | { ok: false; error: string }

// Starting circles is limited per account per day, so a burst of empty circles cannot fill the directory.
const CREATE_LIMIT = 5
const CREATE_WINDOW_MS = 24 * 60 * 60_000
// A handle is at most 15 characters, so anything much longer than that can't name an account.
const MAX_HANDLE_INPUT = 50

function refresh() {
  revalidatePath("/", "layout")
}

function isId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 100
}

type Fields = { name: string; tagline: string; charter: string; access: CircleAccess; joinQuestion: string }

// Reads the create and edit forms. Only the name is required. The question is kept only for ask-to-join circles.
function readFields(formData: FormData): Fields | { error: string } {
  const name = String(formData.get("name") ?? "").trim()
  if (!name) return { error: "Give the circle a name." }
  if ([...name].length > MAX_CIRCLE_NAME) return { error: `Circle names can have up to ${MAX_CIRCLE_NAME} characters.` }
  const tagline = String(formData.get("tagline") ?? "").trim()
  if ([...tagline].length > MAX_CIRCLE_TAGLINE) return { error: `Taglines can have up to ${MAX_CIRCLE_TAGLINE} characters.` }
  const charter = String(formData.get("charter") ?? "")
    .replace(/\r\n/g, "\n")
    .trim()
  if ([...charter].length > MAX_CIRCLE_CHARTER) return { error: `The charter can have up to ${MAX_CIRCLE_CHARTER} characters.` }
  const access = asCircleAccess(formData.get("access"))
  if (!access) return { error: "Choose who can join: anyone, people who ask, or invited people only." }
  const joinQuestion = String(formData.get("joinQuestion") ?? "").trim()
  if ([...joinQuestion].length > MAX_CIRCLE_QUESTION)
    return { error: `The question can have up to ${MAX_CIRCLE_QUESTION} characters.` }
  return { name, tagline, charter, access, joinQuestion: access === "request" ? joinQuestion : "" }
}

export async function createCircle(formData: FormData): Promise<CircleResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in to start a circle." }
  const allowed = consume(`circle:${viewer.id}`, CREATE_LIMIT, CREATE_WINDOW_MS)
  if (!allowed.ok) {
    return { ok: false, error: `You've started a lot of circles today. Try again in ${waitLabel(allowed.retryAfterSeconds)}.` }
  }
  const fields = readFields(formData)
  if ("error" in fields) return { ok: false, error: fields.error }

  const id = newId()
  const now = Date.now()
  // The address is picked inside the transaction, so two circles with the same name can't both claim it.
  const slug = transaction(() => {
    const address = uniqueSlug(fields.name)
    run(
      `INSERT INTO communities (id, name, description, owner_id, created_at, slug, access, charter, join_question, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      fields.name,
      fields.tagline,
      viewer.id,
      now,
      address,
      fields.access,
      fields.charter,
      fields.joinQuestion,
      now
    )
    run("INSERT INTO community_members (community_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)", id, viewer.id, now)
    return address
  })
  refresh()
  return { ok: true, slug }
}

export async function updateCircle(circleId: string, formData: FormData): Promise<VoidResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  if (!isId(circleId) || !isOwner(circleId, viewer.id)) return { ok: false, error: "Only the owner can change this circle." }
  const fields = readFields(formData)
  if ("error" in fields) return { ok: false, error: fields.error }
  transaction(() => {
    run(
      "UPDATE communities SET name = ?, description = ?, charter = ?, access = ?, join_question = ?, updated_at = ? WHERE id = ?",
      fields.name,
      fields.tagline,
      fields.charter,
      fields.access,
      fields.joinQuestion,
      Date.now(),
      circleId
    )
    // Requests only mean something while the circle asks people to request. Switching away clears them.
    if (fields.access !== "request") run("DELETE FROM community_requests WHERE community_id = ?", circleId)
  })
  refresh()
  return { ok: true }
}

// Joining an open circle is immediate. An ask-to-join circle gets a request with the applicant's answer, which the
// owner reads before deciding. An invite-only circle can't be joined from here: a member adds the person by handle.
export async function joinCircle(circleId: string, answer?: string): Promise<JoinResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in to join circles." }
  const circle = isId(circleId)
    ? get<{ owner_id: string | null; access: CircleAccess; join_question: string }>(
        "SELECT owner_id, access, join_question FROM communities WHERE id = ?",
        circleId
      )
    : undefined
  if (!circle) return { ok: false, error: "That circle no longer exists." }
  if (memberRole(circleId, viewer.id)) return { ok: true, state: "joined" }
  if (circle.owner_id && blockedEitherWay(viewer.id, circle.owner_id)) return { ok: false, error: "You can't join this circle." }

  if (circle.access === "closed") return { ok: false, error: "This circle is invite-only. A member can add you by handle." }
  if (circle.access === "open") {
    run(
      "INSERT OR IGNORE INTO community_members (community_id, user_id, role, created_at) VALUES (?, ?, 'member', ?)",
      circleId,
      viewer.id,
      Date.now()
    )
    refresh()
    return { ok: true, state: "joined" }
  }

  const text = String(answer ?? "").trim()
  if (circle.join_question && !text) return { ok: false, error: "Answer the circle's question before you ask to join." }
  if ([...text].length > MAX_CIRCLE_ANSWER) return { ok: false, error: `Answers can have up to ${MAX_CIRCLE_ANSWER} characters.` }
  run(
    `INSERT INTO community_requests (community_id, user_id, answer, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (community_id, user_id) DO UPDATE SET answer = excluded.answer`,
    circleId,
    viewer.id,
    circle.join_question ? text : "",
    Date.now()
  )
  refresh()
  return { ok: true, state: "requested" }
}

export async function cancelRequest(circleId: string): Promise<VoidResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  if (!isId(circleId)) return { ok: false, error: "That circle no longer exists." }
  run("DELETE FROM community_requests WHERE community_id = ? AND user_id = ?", circleId, viewer.id)
  refresh()
  return { ok: true }
}

// The owner can't leave, because a circle needs someone to run it. They can delete it instead.
export async function leaveCircle(circleId: string): Promise<VoidResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  if (!isId(circleId)) return { ok: false, error: "That circle no longer exists." }
  if (isOwner(circleId, viewer.id)) return { ok: false, error: "The owner can't leave. Delete the circle instead." }
  run("DELETE FROM community_members WHERE community_id = ? AND user_id = ? AND role <> 'owner'", circleId, viewer.id)
  refresh()
  return { ok: true }
}

export async function decideRequest(circleId: string, userId: string, approve: boolean): Promise<VoidResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  if (!isId(circleId) || !isOwner(circleId, viewer.id)) return { ok: false, error: "Only the owner can answer requests." }
  if (!isId(userId)) return { ok: false, error: "That request was already answered." }
  const pending = get("SELECT 1 AS found FROM community_requests WHERE community_id = ? AND user_id = ?", circleId, userId)
  if (!pending) return { ok: false, error: "That request was already answered." }
  if (approve && blockedEitherWay(viewer.id, userId)) return { ok: false, error: "You can't add this person." }
  transaction(() => {
    run("DELETE FROM community_requests WHERE community_id = ? AND user_id = ?", circleId, userId)
    if (approve) {
      run(
        "INSERT OR IGNORE INTO community_members (community_id, user_id, role, created_at) VALUES (?, ?, 'member', ?)",
        circleId,
        userId,
        Date.now()
      )
    }
  })
  refresh()
  return { ok: true }
}

export async function addCircleMember(circleId: string, handle: string): Promise<VoidResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  if (!isId(circleId) || !isOwner(circleId, viewer.id)) return { ok: false, error: "Only the owner can add people." }
  const clean = typeof handle === "string" ? handle.trim().replace(/^@/, "").slice(0, MAX_HANDLE_INPUT) : ""
  if (!clean) return { ok: false, error: "Enter the handle of the person to add." }
  const target = get<{ id: string; handle: string }>(
    "SELECT id, handle FROM users WHERE handle = ? COLLATE NOCASE AND deactivated_at IS NULL",
    clean
  )
  if (!target) return { ok: false, error: `@${clean} doesn't exist.` }
  if (blockedEitherWay(viewer.id, target.id)) return { ok: false, error: `You can't add @${target.handle}.` }
  if (memberRole(circleId, target.id)) return { ok: false, error: `@${target.handle} is already in this circle.` }
  transaction(() => {
    run("DELETE FROM community_requests WHERE community_id = ? AND user_id = ?", circleId, target.id)
    run(
      "INSERT OR IGNORE INTO community_members (community_id, user_id, role, created_at) VALUES (?, ?, 'member', ?)",
      circleId,
      target.id,
      Date.now()
    )
  })
  refresh()
  return { ok: true }
}

export async function removeCircleMember(circleId: string, userId: string): Promise<VoidResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  if (!isId(circleId) || !isOwner(circleId, viewer.id)) return { ok: false, error: "Only the owner can remove people." }
  if (!isId(userId)) return { ok: false, error: "Choose who to remove." }
  if (isOwner(circleId, userId)) return { ok: false, error: "The owner can't be removed." }
  run("DELETE FROM community_members WHERE community_id = ? AND user_id = ? AND role <> 'owner'", circleId, userId)
  refresh()
  return { ok: true }
}

// Deletes the circle. Its posts stay as ordinary posts, unless the circle was closed: those go too, because only its
// members were ever meant to see them. The confirmation on the page says which.
export async function deleteCircle(circleId: string): Promise<VoidResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  if (!isId(circleId) || !isOwner(circleId, viewer.id)) return { ok: false, error: "Only the owner can delete this circle." }
  const files = transaction(() => {
    const circle = get<{ access: CircleAccess }>("SELECT access FROM communities WHERE id = ?", circleId)
    return circle ? closeCircle(circleId, circle.access) : []
  })
  removeFiles(files)
  refresh()
  return { ok: true }
}
