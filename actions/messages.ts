"use server"

import { revalidatePath } from "next/cache"
import { getViewer, newId } from "@/lib/auth"
import { all, get, run, transaction } from "@/lib/db"
import { publish } from "@/lib/bus"
import { blockedEitherWay } from "@/lib/notify"
import { MAX_DM, MAX_GROUP_MEMBERS, MAX_GROUP_TITLE, REACTIONS } from "@/lib/rules"
import { removeUpload, saveUpload } from "@/lib/uploads"

export type ChatState = { error?: string; sent?: boolean }
export type IdResult = { ok: true; id: string } | { ok: false; error: string }
export type VoidResult = { ok: true } | { ok: false; error: string }

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

// A new one-to-one chat. The other person gets a request unless they already follow you.
export async function startConversation(handle: string): Promise<IdResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in to send messages." }
  const target = get<{ id: string }>("SELECT id FROM users WHERE handle = ? COLLATE NOCASE AND deactivated_at IS NULL", handle)
  if (!target) return { ok: false, error: "That account doesn't exist." }
  if (target.id === viewer.id) return { ok: false, error: "You can't message yourself." }
  if (blockedEitherWay(viewer.id, target.id)) return { ok: false, error: "You can't message this account." }

  const existing = get<{ id: string }>(
    `SELECT c.id FROM conversations c
     WHERE c.kind = 'dm'
       AND EXISTS (SELECT 1 FROM conversation_members m WHERE m.conversation_id = c.id AND m.user_id = ?)
       AND EXISTS (SELECT 1 FROM conversation_members m WHERE m.conversation_id = c.id AND m.user_id = ?)
       AND (SELECT COUNT(*) FROM conversation_members m WHERE m.conversation_id = c.id) = 2
     LIMIT 1`,
    viewer.id,
    target.id
  )
  if (existing) return { ok: true, id: existing.id }

  const id = newId()
  const now = Date.now()
  transaction(() => {
    run("INSERT INTO conversations (id, kind, title, created_by, created_at, updated_at) VALUES (?, 'dm', '', ?, ?, ?)", id, viewer.id, now, now)
    run("INSERT INTO conversation_members (conversation_id, user_id, status, last_read_at, joined_at) VALUES (?, ?, 'accepted', ?, ?)", id, viewer.id, now, now)
    run(
      "INSERT INTO conversation_members (conversation_id, user_id, status, last_read_at, joined_at) VALUES (?, ?, ?, 0, ?)",
      id,
      target.id,
      follows(target.id, viewer.id) ? "accepted" : "requested",
      now
    )
  })
  refresh()
  return { ok: true, id }
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

  const now = Date.now()
  run(
    "INSERT INTO chat_messages (id, conversation_id, sender_id, body, media_file, post_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    newId(),
    conversationId,
    viewer.id,
    body,
    upload?.ok ? upload.name : null,
    postId,
    now
  )
  run("UPDATE conversations SET updated_at = ? WHERE id = ?", now, conversationId)
  run("UPDATE conversation_members SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?", now, conversationId, viewer.id)
  publish(memberIds(conversationId), { type: "message", conversationId })
  refresh()
  return { sent: true }
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
