"use server"

import { languageOf } from "@/lib/languages"
import { revalidatePath } from "next/cache"
import { getAgreedViewer, newId } from "@/lib/auth"
import { leaveConversationCalls } from "@/lib/call-state"
import { all, get, run, transaction } from "@/lib/db"
import { publish, type EventPerson } from "@/lib/bus"
import { canSeePost, loadMiniUsers, messagesBefore, recentChatPartners, searchUsers, type MessageView, type MiniUser } from "@/lib/data"
import { blockedEitherWay } from "@/lib/notify"
import { isVoiceFile } from "@/lib/media-names"
import { pushMessage } from "@/lib/push"
import { consume, waitLabel } from "@/lib/rate-limit"
import { gate, isNewAccount } from "@/lib/risk"
import { BANNER_PREVIEW_MAX, MAX_DM, MAX_GROUP_MEMBERS, MAX_GROUP_TITLE, REACTIONS } from "@/lib/rules"
import { removeUpload, saveUpload } from "@/lib/uploads"

export type ChatState = { error?: string; sent?: boolean }
export type IdResult = { ok: true; id: string } | { ok: false; error: string }
export type VoidResult = { ok: true } | { ok: false; error: string }

// One person in a group, as the group panel shows them.
export type GroupMember = {
  id: string
  name: string
  handle: string
  avatarFile: string | null
  status: "accepted" | "requested"
  isCreator: boolean
  isYou: boolean
}
export type GroupInfo = { ok: true; title: string; viewerIsCreator: boolean; members: GroupMember[] } | { ok: false; error: string }

// A post can go to this many people at once.
const MAX_SHARE_RECIPIENTS = 10
// A person can send this many messages a minute, and this many photos an hour.
const DM_LIMIT = 60
const DM_WINDOW_MS = 60 * 1000
const PHOTO_LIMIT = 60
const PHOTO_WINDOW_MS = 60 * 60 * 1000
// Earlier messages load this many at a time.
const HISTORY_PAGE = 100
// A handle is at most 15 characters, and an id at most 100, so anything longer can't name anyone.
const MAX_HANDLE_INPUT = 50
const MAX_ID_INPUT = 100

function refresh() {
  revalidatePath("/", "layout")
}

// An id from the browser, or null when it can't be one. Server actions can be called with anything.
function asId(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_ID_INPUT ? value : null
}

function asHandle(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/^@/, "").slice(0, MAX_HANDLE_INPUT) : ""
}

// Counts one use of a limit. The text says how long to wait.
async function tooFast(key: string, limit: number, windowMs: number, what: string): Promise<string | null> {
  const result = await consume(key, limit, windowMs)
  return result.ok ? null : `${what} Try again in ${waitLabel(result.retryAfterSeconds)}.`
}

async function memberStatus(conversationId: unknown, userId: string): Promise<"accepted" | "requested" | null> {
  const id = asId(conversationId)
  if (!id) return null
  return (await get<{ status: "accepted" | "requested" }>(
    "SELECT status FROM conversation_members WHERE conversation_id = ? AND user_id = ?",
    id,
    userId
  ))?.status ?? null
}

async function memberIds(conversationId: string): Promise<string[]> {
  return (await all<{ user_id: string }>("SELECT user_id FROM conversation_members WHERE conversation_id = ?", conversationId)).map((r) => r.user_id)
}

async function follows(followerId: string, followeeId: string): Promise<boolean> {
  return await get("SELECT 1 AS found FROM follows WHERE follower_id = ? AND followee_id = ?", followerId, followeeId) !== undefined
}

async function conversationOf(conversationId: string): Promise<{ kind: "dm" | "group"; title: string; created_by: string | null } | undefined> {
  return await get<{ kind: "dm" | "group"; title: string; created_by: string | null }>(
    "SELECT kind, title, created_by FROM conversations WHERE id = ?",
    conversationId
  )
}

// The one-to-one chat between two people, created when it does not exist yet. The other person gets a request
// unless they already follow you.
async function openDirect(viewerId: string, targetId: string): Promise<IdResult> {
  if (viewerId === targetId) return { ok: false, error: "You can't message yourself." }
  if (await blockedEitherWay(viewerId, targetId)) return { ok: false, error: "You can't message this account." }

  const existing = await get<{ id: string }>(
    `SELECT c.id FROM conversations c
     WHERE c.kind = 'dm'
       AND EXISTS (SELECT 1 FROM conversation_members m WHERE m.conversation_id = c.id AND m.user_id = ?)
       AND EXISTS (SELECT 1 FROM conversation_members m WHERE m.conversation_id = c.id AND m.user_id = ?)
       AND (SELECT COUNT(*) FROM conversation_members m WHERE m.conversation_id = c.id) = 2
     LIMIT 1`,
    viewerId,
    targetId
  )
  if (existing) return { ok: true, id: existing.id }

  const id = newId()
  const now = Date.now()
  await transaction(async () => {
    await run("INSERT INTO conversations (id, kind, title, created_by, created_at, updated_at) VALUES (?, 'dm', '', ?, ?, ?)", id, viewerId, now, now)
    await run("INSERT INTO conversation_members (conversation_id, user_id, status, last_read_at, joined_at) VALUES (?, ?, 'accepted', ?, ?)", id, viewerId, now, now)
    await run(
      "INSERT INTO conversation_members (conversation_id, user_id, status, last_read_at, joined_at) VALUES (?, ?, ?, 0, ?)",
      id,
      targetId,
      await follows(targetId, viewerId) ? "accepted" : "requested",
      now
    )
  })
  return { ok: true, id }
}

// A new one-to-one chat from a handle.
export async function startConversation(
  handle: string,
  proof?: string
): Promise<{ ok: true; id: string } | { ok: false; error: string; proofRequired?: boolean }> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in to send messages." }
  const target = await get<{ id: string; bot: number }>(
    "SELECT id, bot FROM users WHERE handle = ? AND deactivated_at IS NULL",
    asHandle(handle)
  )
  if (!target) return { ok: false, error: "That account doesn't exist." }
  if (target.bot === 1) return { ok: false, error: "Sahayak answers in posts. Mention @sahayak under a post to ask it." }
  // Opening a conversation that already exists is always allowed. A new one passes the account check and the limit.
  const existing = await get(
    `SELECT 1 AS found FROM conversations c
     JOIN conversation_members a ON a.conversation_id = c.id AND a.user_id = ?
     JOIN conversation_members b ON b.conversation_id = c.id AND b.user_id = ?
     WHERE c.kind = 'dm' LIMIT 1`,
    viewer.id,
    target.id
  )
  if (!existing) {
    const verdict = await gate(viewer.id, proof)
    if (!verdict.ok) return { ok: false, error: verdict.error, proofRequired: verdict.proofRequired }
    const fresh = await isNewAccount(viewer.id)
    const limit = await consume(`newchat:${viewer.id}`, fresh ? 5 : 30, 60 * 60_000)
    if (!limit.ok) {
      return { ok: false, error: `You've started a lot of new conversations. Try again in ${waitLabel(limit.retryAfterSeconds)}.`, proofRequired: false }
    }
  }
  const opened = await openDirect(viewer.id, target.id)
  if (opened.ok) refresh()
  return opened
}

// What a banner or the conversation list shows for a message: its text, or what it carries.
function previewOf(body: string, media: string | null, hasPost: boolean): string {
  const chars = [...body]
  if (chars.length > 0) return chars.length > BANNER_PREVIEW_MAX ? `${chars.slice(0, BANNER_PREVIEW_MAX - 1).join("")}…` : body
  if (media) return isVoiceFile(media) ? "Sent a voice message" : "Sent a photo"
  if (hasPost) return "Shared a post"
  return ""
}

// Writes a message and marks it read for its sender. Every member gets a refresh.
async function insertMessage(
  conversationId: string,
  senderId: string,
  body: string,
  mediaFile: string | null,
  postId: string | null,
  replyToId: string | null
): Promise<void> {
  const now = Date.now()
  await run(
    "INSERT INTO chat_messages (id, conversation_id, sender_id, body, media_file, post_id, created_at, lang, reply_to_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    newId(),
    conversationId,
    senderId,
    body,
    mediaFile,
    postId,
    now,
    languageOf(body),
    replyToId
  )
  await run("UPDATE conversations SET updated_at = ? WHERE id = ?", now, conversationId)
  await run("UPDATE conversation_members SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?", now, conversationId, senderId)
  await publish(await memberIds(conversationId), { type: "message", conversationId })
}

// A banner for each other member, and a push to their devices. A request says so, and a muted conversation gets neither.
async function announceMessage(conversationId: string, senderId: string, preview: string): Promise<void> {
  const sender = await get<{ id: string; name: string; handle: string; avatar_file: string | null }>(
    "SELECT id, name, handle, avatar_file FROM users WHERE id = ?",
    senderId
  )
  const conversation = await get<{ kind: "dm" | "group"; title: string }>("SELECT kind, title FROM conversations WHERE id = ?", conversationId)
  if (!sender || !conversation) return
  const from: EventPerson = { id: sender.id, name: sender.name, handle: sender.handle, avatarFile: sender.avatar_file }
  const title = conversation.kind === "group" && conversation.title ? `${sender.name} in ${conversation.title}` : sender.name
  const members = await all<{ user_id: string; status: string; muted: number }>(
    "SELECT user_id, status, muted FROM conversation_members WHERE conversation_id = ? AND user_id <> ?",
    conversationId,
    senderId
  )
  for (const member of members) {
    if (member.muted === 1) continue
    const requested = member.status === "requested"
    await publish([member.user_id], {
      type: "banner",
      kind: requested ? "request" : "message",
      conversationId,
      title,
      line: requested ? "Sent you a message request" : preview || "Sent a message",
      preview: requested && preview ? preview : null,
      href: `/messages/${conversationId}`,
      from,
    })
  }
  await pushMessage(conversationId, { id: sender.id, name: sender.name }, conversation, preview)
}

// A post goes into a message only when it is live and the sender can open it. Their recipient sees the embed under the
// same rule, so a post the sender can't open is never attached. One answer covers deleted, hidden, protected and blocked.
async function sendablePost(postId: string, senderId: string): Promise<boolean> {
  const live = await get("SELECT 1 AS found FROM posts WHERE id = ? AND is_draft = 0 AND publish_at IS NULL", postId)
  return live !== undefined && await canSeePost(postId, senderId)
}

const POST_UNAVAILABLE = "That post isn't available to share."

export async function createGroup(_prev: ChatState, formData: FormData): Promise<ChatState & { id?: string }> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { error: "Sign in to start a group." }
  const title = String(formData.get("title") ?? "").trim()
  if ([...title].length > MAX_GROUP_TITLE) return { error: `Group names can have up to ${MAX_GROUP_TITLE} characters.` }
  const handles = [...new Set(formData.getAll("handles").flatMap((v) => String(v).split(/[\s,]+/)).map((h) => h.replace(/^@/, "").trim()).filter(Boolean))]
  if (handles.length < 2) return { error: "Add at least two people to a group." }
  if (handles.length + 1 > MAX_GROUP_MEMBERS) return { error: `Groups can have up to ${MAX_GROUP_MEMBERS} people.` }

  const users: { id: string }[] = []
  for (const handle of handles) {
    const user = await get<{ id: string }>("SELECT id FROM users WHERE handle = ? AND deactivated_at IS NULL", handle.slice(0, MAX_HANDLE_INPUT))
    if (!user) return { error: `@${handle} doesn't exist.` }
    if (user.id === viewer.id || users.some((added) => added.id === user.id)) continue
    // Everyone in a group can see everyone else, so no two people in it can have a block between them.
    if ((await Promise.all([viewer.id, ...users.map((added) => added.id)].map(async (member) => await blockedEitherWay(member, user.id)))).some(Boolean)) {
      return { error: `You can't add @${handle} to this group.` }
    }
    users.push(user)
  }
  if (users.length < 2) return { error: "Add at least two other people." }

  const id = newId()
  const now = Date.now()
  await transaction(async () => {
    await run("INSERT INTO conversations (id, kind, title, created_by, created_at, updated_at) VALUES (?, 'group', ?, ?, ?, ?)", id, title, viewer.id, now, now)
    await run("INSERT INTO conversation_members (conversation_id, user_id, status, last_read_at, joined_at) VALUES (?, ?, 'accepted', ?, ?)", id, viewer.id, now, now)
    for (const user of users) {
      await run(
        "INSERT INTO conversation_members (conversation_id, user_id, status, last_read_at, joined_at) VALUES (?, ?, ?, 0, ?)",
        id,
        user.id,
        await follows(user.id, viewer.id) ? "accepted" : "requested",
        now
      )
    }
  })
  await publish(await memberIds(id), { type: "message", conversationId: id })
  refresh()
  return { id }
}

// Who is in a group and who made it, fresh from the server. The group panel asks for this whenever it opens.
export async function groupInfo(conversationId: string): Promise<GroupInfo> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  const id = asId(conversationId)
  const conversation = id ? await conversationOf(id) : undefined
  if (!id || !conversation || conversation.kind !== "group" || await memberStatus(id, viewer.id) === null) {
    return { ok: false, error: "That group doesn't exist." }
  }
  const rows = await all<{ user_id: string; status: "accepted" | "requested" }>(
    "SELECT user_id, status FROM conversation_members WHERE conversation_id = ? ORDER BY joined_at ASC, user_id ASC",
    id
  )
  const people = await loadMiniUsers(rows.map((row) => row.user_id))
  const members: GroupMember[] = []
  for (const row of rows) {
    const person = people.get(row.user_id)
    if (!person) continue
    members.push({
      id: person.id,
      name: person.name,
      handle: person.handle,
      avatarFile: person.avatarFile,
      status: row.status,
      isCreator: row.user_id === conversation.created_by,
      isYou: row.user_id === viewer.id,
    })
  }
  // The creator first, then people in the group, then people still invited. Each keeps the order they joined in.
  const rank = (member: GroupMember) => (member.isCreator ? 0 : member.status === "accepted" ? 1 : 2)
  members.sort((a, b) => rank(a) - rank(b))
  return { ok: true, title: conversation.title, viewerIsCreator: conversation.created_by === viewer.id, members }
}

// Adds someone to a group. Someone who follows the person adding them joins at once; anyone else is invited and joins when
// they accept, and the result says which.
export async function addToGroup(conversationId: string, handle: string): Promise<VoidResult & { status?: "accepted" | "requested" }> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  const id = asId(conversationId)
  const status = id ? await memberStatus(id, viewer.id) : null
  const conversation = id ? await conversationOf(id) : undefined
  if (!id || !conversation || !status) return { ok: false, error: "That group doesn't exist." }
  if (conversation.kind !== "group") return { ok: false, error: "Only groups can add people." }
  if (status !== "accepted") return { ok: false, error: "Accept this group first." }
  const clean = asHandle(handle)
  if (!clean) return { ok: false, error: "Enter the handle of the person to add." }
  const user = await get<{ id: string; handle: string }>("SELECT id, handle FROM users WHERE handle = ? AND deactivated_at IS NULL", clean)
  if (!user) return { ok: false, error: "That account doesn't exist." }
  if (await memberStatus(id, user.id)) return { ok: false, error: "They're already in this group." }
  // Everyone in a group can see everyone else, so nobody can be added if any member has blocked them or been blocked by them.
  if ((await Promise.all((await memberIds(id)).map(async (member) => await blockedEitherWay(member, user.id)))).some(Boolean)) {
    return { ok: false, error: `You can't add @${user.handle} to this group.` }
  }
  if ((await memberIds(id)).length >= MAX_GROUP_MEMBERS) return { ok: false, error: `Groups can have up to ${MAX_GROUP_MEMBERS} people.` }
  const joined = await follows(user.id, viewer.id) ? "accepted" : "requested"
  await run(
    "INSERT INTO conversation_members (conversation_id, user_id, status, last_read_at, joined_at) VALUES (?, ?, ?, 0, ?)",
    id,
    user.id,
    joined,
    Date.now()
  )
  await publish(await memberIds(id), { type: "message", conversationId: id })
  refresh()
  return { ok: true, status: joined }
}

// Anyone who has joined a group can give it a new name. An empty name clears it.
export async function renameGroup(conversationId: string, title: string): Promise<VoidResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  const id = asId(conversationId)
  const status = id ? await memberStatus(id, viewer.id) : null
  const conversation = id ? await conversationOf(id) : undefined
  if (!id || !conversation || !status) return { ok: false, error: "That group doesn't exist." }
  if (conversation.kind !== "group") return { ok: false, error: "Only groups have names." }
  if (status !== "accepted") return { ok: false, error: "Accept this group first." }
  if (typeof title !== "string") return { ok: false, error: "Enter a name for the group." }
  const clean = title.trim()
  if ([...clean].length > MAX_GROUP_TITLE) return { ok: false, error: `Group names can have up to ${MAX_GROUP_TITLE} characters.` }
  await run("UPDATE conversations SET title = ? WHERE id = ? AND kind = 'group'", clean, id)
  await publish(await memberIds(id), { type: "message", conversationId: id })
  refresh()
  return { ok: true }
}

// Only the person who made a group can remove someone from it. Removing deletes their place in the group, and anyone in
// the group can add them back. Leaving is a different action, open to every member.
export async function removeFromGroup(conversationId: string, userId: string): Promise<VoidResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  const id = asId(conversationId)
  const status = id ? await memberStatus(id, viewer.id) : null
  const conversation = id ? await conversationOf(id) : undefined
  if (!id || !conversation || !status) return { ok: false, error: "That group doesn't exist." }
  if (conversation.kind !== "group") return { ok: false, error: "Only groups have people to remove." }
  if (conversation.created_by !== viewer.id) return { ok: false, error: "Only the person who made this group can remove people." }
  if (status !== "accepted") return { ok: false, error: "Accept this group first." }
  const target = asId(userId)
  if (!target) return { ok: false, error: "Choose who to remove." }
  if (target === viewer.id) return { ok: false, error: "To go, use Leave group." }
  if (await memberStatus(id, target) === null) return { ok: false, error: "They're not in this group." }
  const everyone = await memberIds(id)
  await run("DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?", id, target)
  // A call they were in ends for them, and the group's call drops out of their view.
  await leaveConversationCalls(target, id, "removed")
  // The person removed is told too, so their screen drops the group.
  await publish(everyone, { type: "message", conversationId: id })
  refresh()
  return { ok: true }
}

// Any member can leave, and a request is declined the same way. When the last person goes, the conversation goes with
// its photos.
// A direct conversation with nobody left to write to: its other person declined the request or left.
async function directConversationClosed(conversationId: string, viewerId: string): Promise<boolean> {
  const kind = (await get<{ kind: string }>("SELECT kind FROM conversations WHERE id = ?", conversationId))?.kind
  if (kind !== "dm") return false
  const others = await get<{ c: number }>(
    "SELECT COUNT(*) AS c FROM conversation_members WHERE conversation_id = ? AND user_id <> ?",
    conversationId,
    viewerId
  )
  return (others?.c ?? 0) === 0
}

export async function leaveConversation(conversationId: string): Promise<VoidResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  const id = asId(conversationId)
  if (!id || await memberStatus(id, viewer.id) === null) return { ok: false, error: "That conversation doesn't exist." }
  const everyone = await memberIds(id)
  const kind = (await get<{ kind: string }>("SELECT kind FROM conversations WHERE id = ?", id))?.kind
  const photos =
    everyone.length === 1
      ? await all<{ media_file: string }>("SELECT media_file FROM chat_messages WHERE conversation_id = ? AND media_file IS NOT NULL", id)
      : []
  await transaction(async () => {
    // The other person of a direct conversation keeps seeing who left, by name.
    if (kind === "dm") {
      await run(
        "INSERT INTO conversation_departures (conversation_id, user_id, left_at) VALUES (?, ?, ?) ON CONFLICT (conversation_id, user_id) DO UPDATE SET left_at = EXCLUDED.left_at",
        id,
        viewer.id,
        Date.now()
      )
    }
    await run("DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?", id, viewer.id)
    if (everyone.length === 1) await run("DELETE FROM conversations WHERE id = ?", id)
  })
  for (const photo of photos) await removeUpload(photo.media_file)
  // A call they were in ends for them, and the conversation's call drops out of their view.
  await leaveConversationCalls(viewer.id, id)
  await publish(everyone, { type: "message", conversationId: id })
  refresh()
  return { ok: true }
}

export async function acceptConversation(conversationId: string): Promise<VoidResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  const id = asId(conversationId)
  if (!id || await memberStatus(id, viewer.id) !== "requested") return { ok: false, error: "That request is gone." }
  await run("UPDATE conversation_members SET status = 'accepted' WHERE conversation_id = ? AND user_id = ?", id, viewer.id)
  await publish(await memberIds(id), { type: "message", conversationId: id })
  refresh()
  return { ok: true }
}

// Declining a request removes you from the conversation. The sender keeps their side.
export async function declineConversation(conversationId: string): Promise<VoidResult> {
  return await leaveConversation(conversationId)
}

export async function markConversationRead(conversationId: string): Promise<void> {
  const viewer = await getAgreedViewer()
  const id = asId(conversationId)
  if (!viewer || !id) return
  await run("UPDATE conversation_members SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?", Date.now(), id, viewer.id)
  await publish([viewer.id], { type: "message", conversationId: id })
  refresh()
}

export async function sendMessage(_prev: ChatState, formData: FormData): Promise<ChatState> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { error: "Sign in to send messages." }
  const conversationId = String(formData.get("conversationId") ?? "")
  const status = await memberStatus(conversationId, viewer.id)
  if (!status) return { error: "That conversation doesn't exist." }
  if (status === "requested") return { error: "Accept this request to reply." }
  if (await directConversationClosed(conversationId, viewer.id)) return { error: "They can't receive messages here anymore." }

  const body = String(formData.get("body") ?? "").replace(/\r\n/g, "\n").trim()
  const image = formData.get("image")
  const postId = String(formData.get("postId") ?? "") || null
  const hasImage = image instanceof File && image.size > 0
  const voice = formData.get("voice")
  const hasVoice = voice instanceof File && voice.size > 0
  if (!body && !hasImage && !hasVoice && !postId) return { error: "Write a message, or add a photo or voice message." }
  if (hasImage && hasVoice) return { error: "Send a photo or a voice message, not both." }
  if ([...body].length > MAX_DM) return { error: `Messages can have up to ${MAX_DM} characters.` }

  const others = (await memberIds(conversationId)).filter((id) => id !== viewer.id)
  if ((await Promise.all(others.map(async (id) => await blockedEitherWay(viewer.id, id)))).some(Boolean)) {
    return { error: "You can't message someone in this conversation." }
  }
  if (postId && !await sendablePost(postId, viewer.id)) return { error: POST_UNAVAILABLE }

  // A reply has to point at a live message in this same chat. A call record or a deleted message can't be answered.
  const replyToId = asId(formData.get("replyTo"))
  if (replyToId) {
    const target = await get<{ id: string; sender_id: string }>(
      "SELECT id, sender_id FROM chat_messages WHERE id = ? AND conversation_id = ? AND call_status IS NULL AND deleted_at IS NULL",
      replyToId,
      conversationId
    )
    if (!target || await blockedEitherWay(viewer.id, target.sender_id)) return { error: "That message can't be replied to anymore." }
  }

  const slowDown =
    await tooFast(`dm:${viewer.id}`, DM_LIMIT, DM_WINDOW_MS, "You're sending messages too fast.") ??
    (hasImage || hasVoice ? await tooFast(`upload:${viewer.id}`, PHOTO_LIMIT, PHOTO_WINDOW_MS, "You've sent a lot of photos.") : null)
  if (slowDown) return { error: slowDown }

  const upload = hasImage ? await saveUpload(image, "image") : hasVoice ? await saveUpload(voice, "audio") : null
  if (upload && !upload.ok) return { error: upload.error }

  const mediaFile = upload?.ok ? upload.name : null
  try {
    await insertMessage(conversationId, viewer.id, body, mediaFile, postId, replyToId)
  } catch (error) {
    await removeUpload(mediaFile)
    throw error
  }
  await announceMessage(conversationId, viewer.id, previewOf(body, mediaFile, postId !== null))
  refresh()
  return { sent: true }
}

export type ShareResult =
  | { ok: true; sent: { handle: string; conversationId: string }[]; failed: { handle: string; error: string }[] }
  | { ok: false; error: string }

// Sends a post to several people at once, each in their own chat, with an optional note.
export async function sharePostWith(postId: string, handles: string[], note: string): Promise<ShareResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in to send messages." }
  const id = asId(postId)
  if (!id || !await sendablePost(id, viewer.id)) return { ok: false, error: POST_UNAVAILABLE }
  if (typeof note !== "string") return { ok: false, error: "Write the note as text." }
  const clean = note.replace(/\r\n/g, "\n").trim()
  if ([...clean].length > MAX_DM) return { ok: false, error: `Messages can have up to ${MAX_DM} characters.` }
  const requested = Array.isArray(handles) ? handles.map(asHandle).filter(Boolean) : []
  const people = [...new Set(requested)].slice(0, MAX_SHARE_RECIPIENTS)
  if (people.length === 0) return { ok: false, error: "Choose someone to send this to." }

  const sent: { handle: string; conversationId: string }[] = []
  const failed: { handle: string; error: string }[] = []
  for (const handle of people) {
    const target = await get<{ id: string; handle: string }>("SELECT id, handle FROM users WHERE handle = ? AND deactivated_at IS NULL", handle)
    if (!target) {
      failed.push({ handle, error: "That account doesn't exist." })
      continue
    }
    // Each copy of the post is a message, so each one counts toward the same limit as any other message.
    const slowDown = await tooFast(`dm:${viewer.id}`, DM_LIMIT, DM_WINDOW_MS, "You're sending messages too fast.")
    if (slowDown) {
      failed.push({ handle: target.handle, error: slowDown })
      continue
    }
    const opened = await openDirect(viewer.id, target.id)
    if (!opened.ok) {
      failed.push({ handle: target.handle, error: opened.error })
      continue
    }
    if (await memberStatus(opened.id, viewer.id) !== "accepted") {
      failed.push({ handle: target.handle, error: "Accept their request before you send anything." })
      continue
    }
    await insertMessage(opened.id, viewer.id, clean, null, id, null)
    await announceMessage(opened.id, viewer.id, previewOf(clean, null, true))
    sent.push({ handle: target.handle, conversationId: opened.id })
  }
  refresh()
  return { ok: true, sent, failed }
}

// The people to offer when sharing: recent chats for an empty search, otherwise accounts that match the search.
export async function shareRecipients(query: string): Promise<MiniUser[]> {
  const viewer = await getAgreedViewer()
  if (!viewer) return []
  const clean = typeof query === "string" ? query.trim().replace(/^@/, "").slice(0, 50) : ""
  if (!clean) return await recentChatPartners(viewer.id)
  return (await searchUsers(clean, viewer.id, 8)).map(({ id, handle, name, avatarFile, verified }) => ({ id, handle, name, avatarFile, verified }))
}

// Older messages in a conversation, for the "Load earlier messages" button. Only members get them, and a member only gets
// what they could already see in the thread.
export async function loadEarlierMessages(conversationId: string, beforeCreatedAt: number): Promise<MessageView[]> {
  const viewer = await getAgreedViewer()
  if (!viewer) return []
  const id = asId(conversationId)
  if (!id || await memberStatus(id, viewer.id) === null) return []
  if (typeof beforeCreatedAt !== "number" || !Number.isFinite(beforeCreatedAt)) return []
  return await messagesBefore(id, viewer.id, beforeCreatedAt, HISTORY_PAGE)
}

// Tells the other members who is typing. The thread shows it for a few seconds.
export async function signalTyping(conversationId: string): Promise<void> {
  const viewer = await getAgreedViewer()
  const id = asId(conversationId)
  if (!viewer || !id || await memberStatus(id, viewer.id) !== "accepted") return
  const name = (await get<{ name: string }>("SELECT name FROM users WHERE id = ?", viewer.id))?.name ?? ""
  const others = (await memberIds(id)).filter((member) => member !== viewer.id)
  await publish(others, { type: "typing", conversationId: id, name })
}

export async function toggleReaction(messageId: string, emoji: string): Promise<VoidResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  if (!(REACTIONS as readonly string[]).includes(emoji)) return { ok: false, error: "That reaction isn't available." }
  const id = asId(messageId)
  const message = id
    ? await get<{ conversation_id: string; sender_id: string; deleted_at: number | null }>(
        "SELECT conversation_id, sender_id, deleted_at FROM chat_messages WHERE id = ?",
        id
      )
    : undefined
  if (!id || !message || message.deleted_at) return { ok: false, error: "That message was deleted." }
  if (await memberStatus(message.conversation_id, viewer.id) !== "accepted") return { ok: false, error: "Accept this conversation first." }
  if (await blockedEitherWay(viewer.id, message.sender_id)) return { ok: false, error: "That message was deleted." }

  const current = await get<{ emoji: string }>("SELECT emoji FROM message_reactions WHERE message_id = ? AND user_id = ?", id, viewer.id)
  await transaction(async () => {
    await run("DELETE FROM message_reactions WHERE message_id = ? AND user_id = ?", id, viewer.id)
    if (current?.emoji !== emoji) {
      await run("INSERT INTO message_reactions (message_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?)", id, viewer.id, emoji, Date.now())
    }
  })
  await publish(await memberIds(message.conversation_id), { type: "message", conversationId: message.conversation_id })
  refresh()
  return { ok: true }
}

export async function deleteMessage(messageId: string): Promise<VoidResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  const id = asId(messageId)
  const message = id
    ? await get<{ sender_id: string; conversation_id: string; media_file: string | null }>(
        "SELECT sender_id, conversation_id, media_file FROM chat_messages WHERE id = ?",
        id
      )
    : undefined
  if (!id || !message || message.sender_id !== viewer.id) return { ok: false, error: "You can only delete your own messages." }
  await run("UPDATE chat_messages SET deleted_at = ?, body = '', media_file = NULL, post_id = NULL WHERE id = ?", Date.now(), id)
  await run("DELETE FROM message_reactions WHERE message_id = ?", id)
  await run("DELETE FROM message_translations WHERE message_id = ?", id)
  await removeUpload(message.media_file)
  await publish(await memberIds(message.conversation_id), { type: "message", conversationId: message.conversation_id })
  refresh()
  return { ok: true }
}

// Muting a conversation keeps its messages but stops them from counting as unread.
export async function toggleConversationMute(conversationId: string): Promise<VoidResult & { muted?: boolean }> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  const id = asId(conversationId)
  const member = id
    ? await get<{ muted: number }>("SELECT muted FROM conversation_members WHERE conversation_id = ? AND user_id = ?", id, viewer.id)
    : undefined
  if (!id || !member) return { ok: false, error: "That conversation doesn't exist." }
  const muted = member.muted === 1 ? 0 : 1
  await run("UPDATE conversation_members SET muted = ? WHERE conversation_id = ? AND user_id = ?", muted, id, viewer.id)
  refresh()
  return { ok: true, muted: muted === 1 }
}
