"use server"

import { revalidatePath } from "next/cache"
import { getViewer, newId } from "@/lib/auth"
import { all, get, run, transaction } from "@/lib/db"
import { publish, type EventPerson } from "@/lib/bus"
import { recentChatPartners, searchUsers, type MiniUser } from "@/lib/data"
import { blockedEitherWay } from "@/lib/notify"
import { BANNER_PREVIEW_MAX, MAX_DM, MAX_GROUP_MEMBERS, MAX_GROUP_TITLE, REACTIONS } from "@/lib/rules"
import { removeUpload, saveUpload } from "@/lib/uploads"

export type ChatState = { error?: string; sent?: boolean }
export type IdResult = { ok: true; id: string } | { ok: false; error: string }
export type VoidResult = { ok: true } | { ok: false; error: string }

// A post can go to this many people at once.
const MAX_SHARE_RECIPIENTS = 10

function refresh() {
  revalidatePath("/", "layout")
}

function memberStatus(conversationId: string, userId: string): "accepted" | "requested" | null {
  return get<{ status: "accepted" | "requested" }>(
    "SELECT status FROM conversation_members WHERE conversation_id = ? AND user_id = ?",
    conversationId,
    userId
  )?.status ?? null
}

function memberIds(conversationId: string): string[] {
  return all<{ user_id: string }>("SELECT user_id FROM conversation_members WHERE conversation_id = ?", conversationId).map((r) => r.user_id)
}

function follows(followerId: string, followeeId: string): boolean {
  return get("SELECT 1 AS found FROM follows WHERE follower_id = ? AND followee_id = ?", followerId, followeeId) !== undefined
}

// The one-to-one chat between two people, created when it does not exist yet. The other person gets a request
// unless they already follow you.
function openDirect(viewerId: string, targetId: string): IdResult {
  if (viewerId === targetId) return { ok: false, error: "You can't message yourself." }
  if (blockedEitherWay(viewerId, targetId)) return { ok: false, error: "You can't message this account." }

  const existing = get<{ id: string }>(
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
  transaction(() => {
    run("INSERT INTO conversations (id, kind, title, created_by, created_at, updated_at) VALUES (?, 'dm', '', ?, ?, ?)", id, viewerId, now, now)
    run("INSERT INTO conversation_members (conversation_id, user_id, status, last_read_at, joined_at) VALUES (?, ?, 'accepted', ?, ?)", id, viewerId, now, now)
    run(
      "INSERT INTO conversation_members (conversation_id, user_id, status, last_read_at, joined_at) VALUES (?, ?, ?, 0, ?)",
      id,
      targetId,
      follows(targetId, viewerId) ? "accepted" : "requested",
      now
    )
  })
  return { ok: true, id }
}

// A new one-to-one chat from a handle.
export async function startConversation(handle: string): Promise<IdResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in to send messages." }
  const target = get<{ id: string }>("SELECT id FROM users WHERE handle = ? COLLATE NOCASE AND deactivated_at IS NULL", handle)
  if (!target) return { ok: false, error: "That account doesn't exist." }
  const opened = openDirect(viewer.id, target.id)
  if (opened.ok) refresh()
  return opened
}

// What a banner or the conversation list shows for a message: its text, or what it carries.
function previewOf(body: string, hasPhoto: boolean, hasPost: boolean): string {
  const chars = [...body]
  if (chars.length > 0) return chars.length > BANNER_PREVIEW_MAX ? `${chars.slice(0, BANNER_PREVIEW_MAX - 1).join("")}…` : body
  if (hasPhoto) return "Sent a photo"
  if (hasPost) return "Shared a post"
  return ""
}

// Writes a message and marks it read for its sender. Every member gets a refresh.
function insertMessage(conversationId: string, senderId: string, body: string, mediaFile: string | null, postId: string | null): void {
  const now = Date.now()
  run(
    "INSERT INTO chat_messages (id, conversation_id, sender_id, body, media_file, post_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    newId(),
    conversationId,
    senderId,
    body,
    mediaFile,
    postId,
    now
  )
  run("UPDATE conversations SET updated_at = ? WHERE id = ?", now, conversationId)
  run("UPDATE conversation_members SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?", now, conversationId, senderId)
  publish(memberIds(conversationId), { type: "message", conversationId })
}

// A banner for each other member. A request says so, and a muted conversation gets none.
function announceMessage(conversationId: string, senderId: string, preview: string): void {
  const sender = get<{ id: string; name: string; handle: string; avatar_file: string | null }>(
    "SELECT id, name, handle, avatar_file FROM users WHERE id = ?",
    senderId
  )
  const conversation = get<{ kind: "dm" | "group"; title: string }>("SELECT kind, title FROM conversations WHERE id = ?", conversationId)
  if (!sender || !conversation) return
  const from: EventPerson = { id: sender.id, name: sender.name, handle: sender.handle, avatarFile: sender.avatar_file }
  const title = conversation.kind === "group" && conversation.title ? `${sender.name} in ${conversation.title}` : sender.name
  const members = all<{ user_id: string; status: string; muted: number }>(
    "SELECT user_id, status, muted FROM conversation_members WHERE conversation_id = ? AND user_id <> ?",
    conversationId,
    senderId
  )
  for (const member of members) {
    if (member.muted === 1) continue
    const requested = member.status === "requested"
    publish([member.user_id], {
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
}

export async function createGroup(_prev: ChatState, formData: FormData): Promise<ChatState & { id?: string }> {
  const viewer = await getViewer()
  if (!viewer) return { error: "Sign in to start a group." }
  const title = String(formData.get("title") ?? "").trim()
  if ([...title].length > MAX_GROUP_TITLE) return { error: `Group names can have up to ${MAX_GROUP_TITLE} characters.` }
  const handles = [...new Set(formData.getAll("handles").flatMap((v) => String(v).split(/[\s,]+/)).map((h) => h.replace(/^@/, "").trim()).filter(Boolean))]
  if (handles.length < 2) return { error: "Add at least two people to a group." }
  if (handles.length + 1 > MAX_GROUP_MEMBERS) return { error: `Groups can have up to ${MAX_GROUP_MEMBERS} people.` }

  const users: { id: string }[] = []
  for (const handle of handles) {
    const user = get<{ id: string }>("SELECT id FROM users WHERE handle = ? COLLATE NOCASE AND deactivated_at IS NULL", handle)
    if (!user) return { error: `@${handle} doesn't exist.` }
    if (user.id === viewer.id) continue
    if (blockedEitherWay(viewer.id, user.id)) return { error: `You can't add @${handle}.` }
    users.push(user)
  }
  if (users.length < 2) return { error: "Add at least two other people." }

  const id = newId()
  const now = Date.now()
  transaction(() => {
    run("INSERT INTO conversations (id, kind, title, created_by, created_at, updated_at) VALUES (?, 'group', ?, ?, ?, ?)", id, title, viewer.id, now, now)
    run("INSERT INTO conversation_members (conversation_id, user_id, status, last_read_at, joined_at) VALUES (?, ?, 'accepted', ?, ?)", id, viewer.id, now, now)
    for (const user of users) {
      run(
        "INSERT INTO conversation_members (conversation_id, user_id, status, last_read_at, joined_at) VALUES (?, ?, ?, 0, ?)",
        id,
        user.id,
        follows(user.id, viewer.id) ? "accepted" : "requested",
        now
      )
    }
  })
  publish(memberIds(id), { type: "message", conversationId: id })
  refresh()
  return { id }
}

export async function addToGroup(conversationId: string, handle: string): Promise<VoidResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  const kind = get<{ kind: string }>("SELECT kind FROM conversations WHERE id = ?", conversationId)
  if (!kind || kind.kind !== "group") return { ok: false, error: "Only groups can add people." }
  if (memberStatus(conversationId, viewer.id) !== "accepted") return { ok: false, error: "Accept this group first." }
  const user = get<{ id: string }>("SELECT id FROM users WHERE handle = ? COLLATE NOCASE AND deactivated_at IS NULL", handle.replace(/^@/, ""))
  if (!user) return { ok: false, error: "That account doesn't exist." }
  if (memberStatus(conversationId, user.id)) return { ok: false, error: "They're already in this group." }
  if (blockedEitherWay(viewer.id, user.id)) return { ok: false, error: "You can't add this account." }
  const count = all<{ user_id: string }>("SELECT user_id FROM conversation_members WHERE conversation_id = ?", conversationId).length
  if (count >= MAX_GROUP_MEMBERS) return { ok: false, error: `Groups can have up to ${MAX_GROUP_MEMBERS} people.` }
  run(
    "INSERT INTO conversation_members (conversation_id, user_id, status, last_read_at, joined_at) VALUES (?, ?, ?, 0, ?)",
    conversationId,
    user.id,
    follows(user.id, viewer.id) ? "accepted" : "requested",
    Date.now()
  )
  publish(memberIds(conversationId), { type: "message", conversationId })
  refresh()
  return { ok: true }
}

export async function renameGroup(conversationId: string, title: string): Promise<VoidResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  if (memberStatus(conversationId, viewer.id) !== "accepted") return { ok: false, error: "Accept this group first." }
  const clean = title.trim()
  if ([...clean].length > MAX_GROUP_TITLE) return { ok: false, error: `Group names can have up to ${MAX_GROUP_TITLE} characters.` }
  run("UPDATE conversations SET title = ? WHERE id = ? AND kind = 'group'", clean, conversationId)
  refresh()
  return { ok: true }
}

export async function leaveConversation(conversationId: string): Promise<VoidResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  run("DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?", conversationId, viewer.id)
  const remaining = all<{ user_id: string }>("SELECT user_id FROM conversation_members WHERE conversation_id = ?", conversationId).length
  if (remaining === 0) run("DELETE FROM conversations WHERE id = ?", conversationId)
  publish(memberIds(conversationId), { type: "message", conversationId })
  refresh()
  return { ok: true }
}

export async function acceptConversation(conversationId: string): Promise<VoidResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  if (memberStatus(conversationId, viewer.id) !== "requested") return { ok: false, error: "That request is gone." }
  run("UPDATE conversation_members SET status = 'accepted' WHERE conversation_id = ? AND user_id = ?", conversationId, viewer.id)
  publish(memberIds(conversationId), { type: "message", conversationId })
  refresh()
  return { ok: true }
}

// Declining a request removes you from the conversation. The sender keeps their side.
export async function declineConversation(conversationId: string): Promise<VoidResult> {
  return leaveConversation(conversationId)
}

export async function markConversationRead(conversationId: string): Promise<void> {
  const viewer = await getViewer()
  if (!viewer) return
  run("UPDATE conversation_members SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?", Date.now(), conversationId, viewer.id)
  publish([viewer.id], { type: "message", conversationId })
  refresh()
}

export async function sendMessage(_prev: ChatState, formData: FormData): Promise<ChatState> {
  const viewer = await getViewer()
  if (!viewer) return { error: "Sign in to send messages." }
  const conversationId = String(formData.get("conversationId") ?? "")
  const status = memberStatus(conversationId, viewer.id)
  if (!status) return { error: "That conversation doesn't exist." }
  if (status === "requested") return { error: "Accept this request to reply." }

  const body = String(formData.get("body") ?? "").replace(/\r\n/g, "\n").trim()
  const image = formData.get("image")
  const postId = String(formData.get("postId") ?? "") || null
  const hasImage = image instanceof File && image.size > 0
  if (!body && !hasImage && !postId) return { error: "Write a message or add a photo." }
  if ([...body].length > MAX_DM) return { error: `Messages can have up to ${MAX_DM} characters.` }

  const others = memberIds(conversationId).filter((id) => id !== viewer.id)
  if (others.some((id) => blockedEitherWay(viewer.id, id))) {
    return { error: "You can't message someone in this conversation." }
  }

  const upload = hasImage ? await saveUpload(image, "image") : null
  if (upload && !upload.ok) return { error: upload.error }

  if (postId) {
    const post = get<{ id: string }>("SELECT id FROM posts WHERE id = ? AND is_draft = 0 AND publish_at IS NULL", postId)
    if (!post) return { error: "That post is no longer available." }
  }

  const mediaFile = upload?.ok ? upload.name : null
  insertMessage(conversationId, viewer.id, body, mediaFile, postId)
  announceMessage(conversationId, viewer.id, previewOf(body, mediaFile !== null, postId !== null))
  refresh()
  return { sent: true }
}

export type ShareResult =
  | { ok: true; sent: { handle: string; conversationId: string }[]; failed: { handle: string; error: string }[] }
  | { ok: false; error: string }

// Sends a post to several people at once, each in their own chat, with an optional note.
export async function sharePostWith(postId: string, handles: string[], note: string): Promise<ShareResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in to send messages." }
  const post = get<{ id: string }>("SELECT id FROM posts WHERE id = ? AND is_draft = 0 AND publish_at IS NULL", postId)
  if (!post) return { ok: false, error: "That post is no longer available." }
  const clean = note.replace(/\r\n/g, "\n").trim()
  if ([...clean].length > MAX_DM) return { ok: false, error: `Messages can have up to ${MAX_DM} characters.` }
  const people = [...new Set(handles.map((h) => h.trim().replace(/^@/, "")).filter(Boolean))].slice(0, MAX_SHARE_RECIPIENTS)
  if (people.length === 0) return { ok: false, error: "Choose someone to send this to." }

  const sent: { handle: string; conversationId: string }[] = []
  const failed: { handle: string; error: string }[] = []
  for (const handle of people) {
    const target = get<{ id: string; handle: string }>("SELECT id, handle FROM users WHERE handle = ? COLLATE NOCASE AND deactivated_at IS NULL", handle)
    if (!target) {
      failed.push({ handle, error: "That account doesn't exist." })
      continue
    }
    const opened = openDirect(viewer.id, target.id)
    if (!opened.ok) {
      failed.push({ handle: target.handle, error: opened.error })
      continue
    }
    if (memberStatus(opened.id, viewer.id) !== "accepted") {
      failed.push({ handle: target.handle, error: "Accept their request before you send anything." })
      continue
    }
    insertMessage(opened.id, viewer.id, clean, null, post.id)
    announceMessage(opened.id, viewer.id, previewOf(clean, false, true))
    sent.push({ handle: target.handle, conversationId: opened.id })
  }
  refresh()
  return { ok: true, sent, failed }
}

// The people to offer when sharing: recent chats for an empty search, otherwise accounts that match the search.
export async function shareRecipients(query: string): Promise<MiniUser[]> {
  const viewer = await getViewer()
  if (!viewer) return []
  const clean = query.trim().replace(/^@/, "").slice(0, 50)
  if (!clean) return recentChatPartners(viewer.id)
  return searchUsers(clean, viewer.id, 8).map(({ id, handle, name, avatarFile, verified }) => ({ id, handle, name, avatarFile, verified }))
}

// Tells the other members who is typing. The thread shows it for a few seconds.
export async function signalTyping(conversationId: string): Promise<void> {
  const viewer = await getViewer()
  if (!viewer || memberStatus(conversationId, viewer.id) !== "accepted") return
  const name = get<{ name: string }>("SELECT name FROM users WHERE id = ?", viewer.id)?.name ?? ""
  const others = memberIds(conversationId).filter((id) => id !== viewer.id)
  publish(others, { type: "typing", conversationId, name })
}

export async function toggleReaction(messageId: string, emoji: string): Promise<VoidResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  if (!(REACTIONS as readonly string[]).includes(emoji)) return { ok: false, error: "That reaction isn't available." }
  const message = get<{ conversation_id: string; deleted_at: number | null }>(
    "SELECT conversation_id, deleted_at FROM chat_messages WHERE id = ?",
    messageId
  )
  if (!message || message.deleted_at) return { ok: false, error: "That message was deleted." }
  if (memberStatus(message.conversation_id, viewer.id) !== "accepted") return { ok: false, error: "Accept this conversation first." }

  const current = get<{ emoji: string }>("SELECT emoji FROM message_reactions WHERE message_id = ? AND user_id = ?", messageId, viewer.id)
  transaction(() => {
    run("DELETE FROM message_reactions WHERE message_id = ? AND user_id = ?", messageId, viewer.id)
    if (current?.emoji !== emoji) {
      run("INSERT INTO message_reactions (message_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?)", messageId, viewer.id, emoji, Date.now())
    }
  })
  publish(memberIds(message.conversation_id), { type: "message", conversationId: message.conversation_id })
  refresh()
  return { ok: true }
}

export async function deleteMessage(messageId: string): Promise<VoidResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  const message = get<{ sender_id: string; conversation_id: string; media_file: string | null }>(
    "SELECT sender_id, conversation_id, media_file FROM chat_messages WHERE id = ?",
    messageId
  )
  if (!message || message.sender_id !== viewer.id) return { ok: false, error: "You can only delete your own messages." }
  run("UPDATE chat_messages SET deleted_at = ?, body = '', media_file = NULL, post_id = NULL WHERE id = ?", Date.now(), messageId)
  run("DELETE FROM message_reactions WHERE message_id = ?", messageId)
  removeUpload(message.media_file)
  publish(memberIds(message.conversation_id), { type: "message", conversationId: message.conversation_id })
  refresh()
  return { ok: true }
}

// Muting a conversation keeps its messages but stops them from counting as unread.
export async function toggleConversationMute(conversationId: string): Promise<VoidResult & { muted?: boolean }> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  const member = get<{ muted: number }>("SELECT muted FROM conversation_members WHERE conversation_id = ? AND user_id = ?", conversationId, viewer.id)
  if (!member) return { ok: false, error: "That conversation doesn't exist." }
  const muted = member.muted === 1 ? 0 : 1
  run("UPDATE conversation_members SET muted = ? WHERE conversation_id = ? AND user_id = ?", muted, conversationId, viewer.id)
  refresh()
  return { ok: true, muted: muted === 1 }
}
