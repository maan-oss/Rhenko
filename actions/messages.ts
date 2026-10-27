"use server"

import { languageOf } from "@/lib/languages"
import { revalidatePath } from "next/cache"
import { getAgreedViewer, newId } from "@/lib/auth"
import { leaveConversationCalls } from "@/lib/call-state"
import { all, get, run, transaction } from "@/lib/db"
import { publish, type EventPerson } from "@/lib/bus"
import { canReadConversation, canSeePost, conversationSummaries, loadMiniUsers, messagesBefore, recentChatPartners, searchUsers, type MessageView, type MiniUser } from "@/lib/data"
import { PINNED_CHATS_MAX, forwardRefusal, forwardTargetsInput } from "@/lib/chat-organize-rules"
import { blockedEitherWay } from "@/lib/notify"
import { attachmentPreview, attachmentText, cleanFileName, parseAttachment, type Attachment } from "@/lib/message-attachments"
import { firstLink, requestPreviews } from "@/lib/link-previews"
import { pollInput, pollVoteInput } from "@/lib/poll-rules"
import { pushGroupAdded, pushMessage } from "@/lib/push"
import { consume, waitLabel } from "@/lib/rate-limit"
import { gate, isNewAccount } from "@/lib/risk"
import { BANNER_PREVIEW_MAX, MAX_DM, MAX_GROUP_MEMBERS, MAX_GROUP_TITLE, REACTIONS } from "@/lib/rules"
import { removeUpload, saveUpload } from "@/lib/uploads"
import { asMessageTimer, expiryFor, isExpired } from "@/lib/message-timers"
import { groupForInvite, inviteStanding, newInviteToken } from "@/lib/group-invites"

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
// `inviteToken` is the group's invite link, for members who have joined. It is null when there is none, and for someone
// who is only invited.
export type GroupInfo =
  | { ok: true; title: string; viewerIsCreator: boolean; members: GroupMember[]; inviteToken: string | null }
  | { ok: false; error: string }
export type InviteLinkResult = { ok: true; token: string | null } | { ok: false; error: string }

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

// New conversations an hour: fewer for an account made in the last week.
const NEW_CHAT_WINDOW_MS = 60 * 60_000
type ReachCheck = { ok: true } | { ok: false; error: string; proofRequired: boolean }

// Reaching many new people at once is what spam and hijacked accounts do. So every way of reaching someone new passes the
// account check and the hourly limit on new conversations: a new chat, a post shared with someone there is no chat with
// yet, and a group that invites people who don't follow the sender. Each new person counts once against the limit.
async function mayReachNewPeople(viewerId: string, proof: unknown, people: number): Promise<ReachCheck> {
  if (people <= 0) return { ok: true }
  const verdict = await gate(viewerId, proof)
  if (!verdict.ok) return verdict
  const limit = await isNewAccount(viewerId) ? 5 : 30
  for (let i = 0; i < people; i++) {
    const room = await consume(`newchat:${viewerId}`, limit, NEW_CHAT_WINDOW_MS)
    if (!room.ok) {
      return { ok: false, error: `You've started a lot of new conversations. Try again in ${waitLabel(room.retryAfterSeconds)}.`, proofRequired: false }
    }
  }
  return { ok: true }
}

// The one-to-one chat between two people, or null when they have none yet.
async function directBetween(a: string, b: string): Promise<string | null> {
  return (await get<{ id: string }>(
    `SELECT c.id FROM conversations c
     WHERE c.kind = 'dm'
       AND EXISTS (SELECT 1 FROM conversation_members m WHERE m.conversation_id = c.id AND m.user_id = ?)
       AND EXISTS (SELECT 1 FROM conversation_members m WHERE m.conversation_id = c.id AND m.user_id = ?)
       AND (SELECT COUNT(*) FROM conversation_members m WHERE m.conversation_id = c.id) = 2
     LIMIT 1`,
    a,
    b
  ))?.id ?? null
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

  const existing = await directBetween(viewerId, targetId)
  if (existing) return { ok: true, id: existing }

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
  const reach = await mayReachNewPeople(viewer.id, proof, existing ? 0 : 1)
  if (!reach.ok) return reach
  const opened = await openDirect(viewer.id, target.id)
  if (opened.ok) refresh()
  return opened
}

// What a banner or the conversation list shows for a message: its text, or what it carries.
function previewOf(body: string, media: string | null, attachment: Attachment | null, hasPost: boolean): string {
  const chars = [...body]
  if (chars.length > 0) return chars.length > BANNER_PREVIEW_MAX ? `${chars.slice(0, BANNER_PREVIEW_MAX - 1).join("")}…` : body
  const kind = attachmentPreview(attachment, media)
  if (kind) return kind
  if (hasPost) return "Shared a post"
  return ""
}

// Writes a message and marks it read for its sender. Every member gets a refresh. While the conversation's timer is on, the
// message is given the moment it disappears: the timer in force now, never one set later.
async function insertMessage(
  conversationId: string,
  senderId: string,
  body: string,
  mediaFile: string | null,
  postId: string | null,
  replyToId: string | null,
  attachment: Attachment | null,
  forwarded = false
): Promise<void> {
  const now = Date.now()
  const timer = (await get<{ message_timer: number }>("SELECT message_timer FROM conversations WHERE id = ?", conversationId))?.message_timer ?? 0
  await run(
    "INSERT INTO chat_messages (id, conversation_id, sender_id, body, media_file, post_id, created_at, lang, reply_to_id, expires_at, attachment, forwarded) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    newId(),
    conversationId,
    senderId,
    body,
    mediaFile,
    postId,
    now,
    languageOf(body),
    replyToId,
    expiryFor(now, timer),
    attachment ? attachmentText(attachment) : null,
    forwarded ? 1 : 0
  )
  await run("UPDATE conversations SET updated_at = ? WHERE id = ?", now, conversationId)
  await run("UPDATE conversation_members SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?", now, conversationId, senderId)
  // A new message brings an archived chat back to the chats list for everyone else in it, as WhatsApp does.
  await run("UPDATE conversation_members SET archived = 0 WHERE conversation_id = ? AND user_id <> ? AND archived = 1", conversationId, senderId)
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

export async function createGroup(_prev: ChatState, formData: FormData): Promise<ChatState & { id?: string; proofRequired?: boolean }> {
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

  // People who follow the creator join at once. Everyone else gets a request, and each of those counts as a new conversation.
  const statuses = await Promise.all(users.map(async (user) => (await follows(user.id, viewer.id) ? "accepted" : "requested")))
  const reach = await mayReachNewPeople(viewer.id, formData.get("proof"), statuses.filter((status) => status === "requested").length)
  if (!reach.ok) return { error: reach.error, proofRequired: reach.proofRequired }

  const id = newId()
  const now = Date.now()
  await transaction(async () => {
    await run("INSERT INTO conversations (id, kind, title, created_by, created_at, updated_at) VALUES (?, 'group', ?, ?, ?, ?)", id, title, viewer.id, now, now)
    await run("INSERT INTO conversation_members (conversation_id, user_id, status, last_read_at, joined_at) VALUES (?, ?, 'accepted', ?, ?)", id, viewer.id, now, now)
    for (const [index, user] of users.entries()) {
      await run(
        "INSERT INTO conversation_members (conversation_id, user_id, status, last_read_at, joined_at) VALUES (?, ?, ?, 0, ?)",
        id,
        user.id,
        statuses[index],
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
  const status = id ? await memberStatus(id, viewer.id) : null
  if (!id || !conversation || conversation.kind !== "group" || status === null) {
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
  const inviteToken =
    status === "accepted" ? ((await get<{ invite_token: string | null }>("SELECT invite_token FROM conversations WHERE id = ?", id))?.invite_token ?? null) : null
  return { ok: true, title: conversation.title, viewerIsCreator: conversation.created_by === viewer.id, members, inviteToken }
}

// Making or resetting an invite link: this many times in INVITE_LINK_WINDOW_MS per person.
const INVITE_LINK_LIMIT = 20
const INVITE_LINK_WINDOW_MS = 60 * 60 * 1000
// Joining with a link: this many tries in JOIN_WINDOW_MS per person. A wrong or old link counts as well.
const JOIN_LIMIT = 10
const JOIN_WINDOW_MS = 10 * 60 * 1000
const INVITE_GONE = "This invite link doesn't work anymore. Ask someone in the group for a new one."

// The group whose invite link the viewer wants to change. Anyone who has joined the group can make, copy, reset or turn
// off its link. Someone only invited can't until they accept.
async function linkGroup(conversationId: unknown, viewerId: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const id = asId(conversationId)
  const status = id ? await memberStatus(id, viewerId) : null
  const conversation = id ? await conversationOf(id) : undefined
  if (!id || !conversation || !status) return { ok: false, error: "That group doesn't exist." }
  if (conversation.kind !== "group") return { ok: false, error: "Only groups have invite links." }
  if (status !== "accepted") return { ok: false, error: "Accept this group first." }
  return { ok: true, id }
}

// Gives the group an invite link, or returns the one it has.
export async function createInviteLink(conversationId: string): Promise<InviteLinkResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  const group = await linkGroup(conversationId, viewer.id)
  if (!group.ok) return group
  const slowDown = await tooFast(`invite-link:${viewer.id}`, INVITE_LINK_LIMIT, INVITE_LINK_WINDOW_MS, "You've made a lot of invite links.")
  if (slowDown) return { ok: false, error: slowDown }
  const row = await get<{ invite_token: string }>(
    "UPDATE conversations SET invite_token = COALESCE(invite_token, ?) WHERE id = ? AND kind = 'group' RETURNING invite_token",
    newInviteToken(),
    group.id
  )
  return row ? { ok: true, token: row.invite_token } : { ok: false, error: "That group doesn't exist." }
}

// Replaces the link with a new one. The old link stops working at once.
export async function resetInviteLink(conversationId: string): Promise<InviteLinkResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  const group = await linkGroup(conversationId, viewer.id)
  if (!group.ok) return group
  const slowDown = await tooFast(`invite-link:${viewer.id}`, INVITE_LINK_LIMIT, INVITE_LINK_WINDOW_MS, "You've made a lot of invite links.")
  if (slowDown) return { ok: false, error: slowDown }
  const row = await get<{ invite_token: string }>(
    "UPDATE conversations SET invite_token = ? WHERE id = ? AND kind = 'group' RETURNING invite_token",
    newInviteToken(),
    group.id
  )
  return row ? { ok: true, token: row.invite_token } : { ok: false, error: "That group doesn't exist." }
}

// Turns the link off. Nobody can join with it, and a new one can be made later.
export async function removeInviteLink(conversationId: string): Promise<InviteLinkResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  const group = await linkGroup(conversationId, viewer.id)
  if (!group.ok) return group
  await run("UPDATE conversations SET invite_token = NULL WHERE id = ? AND kind = 'group'", group.id)
  return { ok: true, token: null }
}

// Joins a group with its invite link. No one has to approve it. Someone already in the group is sent to it, and someone
// invited who had not accepted yet is accepted. Nobody who has a block with anyone in the group can join, and the group's
// size limit holds: the group's row is locked while the place is taken, so two people joining at once can't pass it.
export async function joinGroupWithInvite(token: string): Promise<IdResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in to join this group." }
  const slowDown = await tooFast(`group-join:${viewer.id}`, JOIN_LIMIT, JOIN_WINDOW_MS, "You've tried to join a lot of groups.")
  if (slowDown) return { ok: false, error: slowDown }
  const invite = await groupForInvite(token)
  if (!invite) return { ok: false, error: INVITE_GONE }
  const id = invite.conversationId
  const standing = await inviteStanding(id, viewer.id)
  if (standing.status === "accepted") return { ok: true, id }
  if (standing.blocked) return { ok: false, error: "You can't join this group." }

  const now = Date.now()
  const outcome = await transaction(async (): Promise<"joined" | "gone" | "full"> => {
    // A link reset or turned off a moment ago no longer opens the group.
    if (!await get("SELECT id FROM conversations WHERE id = ? AND invite_token = ? AND kind = 'group' FOR UPDATE", id, token)) return "gone"
    if (standing.status === "requested") {
      await run("UPDATE conversation_members SET status = 'accepted' WHERE conversation_id = ? AND user_id = ?", id, viewer.id)
      return "joined"
    }
    const count = (await get<{ c: number }>("SELECT COUNT(*) AS c FROM conversation_members WHERE conversation_id = ?", id))?.c ?? 0
    if (count >= MAX_GROUP_MEMBERS) return "full"
    await run(
      `INSERT INTO conversation_members (conversation_id, user_id, status, last_read_at, joined_at) VALUES (?, ?, 'accepted', ?, ?)
       ON CONFLICT (conversation_id, user_id) DO UPDATE SET status = 'accepted'`,
      id,
      viewer.id,
      now,
      now
    )
    return "joined"
  })
  if (outcome === "gone") return { ok: false, error: INVITE_GONE }
  if (outcome === "full") return { ok: false, error: `This group is full. Groups can have up to ${MAX_GROUP_MEMBERS} people.` }
  await publish(await memberIds(id), { type: "message", conversationId: id })
  refresh()
  return { ok: true, id }
}

// Adds someone to a group. Someone who follows the person adding them joins at once; anyone else is invited and joins when
// they accept, and the result says which.
export async function addToGroup(
  conversationId: string,
  handle: string,
  proof?: string
): Promise<VoidResult & { status?: "accepted" | "requested"; proofRequired?: boolean }> {
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
  // An invitation is a request to someone who doesn't follow the person adding them, so it counts as a new conversation.
  const reach = await mayReachNewPeople(viewer.id, proof, joined === "requested" ? 1 : 0)
  if (!reach.ok) return reach
  await run(
    "INSERT INTO conversation_members (conversation_id, user_id, status, last_read_at, joined_at) VALUES (?, ?, ?, 0, ?)",
    id,
    user.id,
    joined,
    Date.now()
  )
  await publish(await memberIds(id), { type: "message", conversationId: id })
  void pushGroupAdded(id, { id: viewer.id, name: viewer.name }, user.id, conversation.title, joined === "requested").catch((error) =>
    console.error("[push] group add failed", error)
  )
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
  const postId = String(formData.get("postId") ?? "") || null
  // Each attachment is one of these fields. A photo or video is "image" (a camera or gallery pick), a scan is a photo
  // marked "scan", and a voice note is "voice". Audio files, documents, a contact and a place are their own fields.
  const image = formData.get("image")
  const voice = formData.get("voice")
  const audio = formData.get("audio")
  const document = formData.get("document")
  const hasImage = image instanceof File && image.size > 0
  const hasVoice = voice instanceof File && voice.size > 0
  const hasAudio = audio instanceof File && audio.size > 0
  const hasDocument = document instanceof File && document.size > 0
  const hasUpload = hasImage || hasVoice || hasAudio || hasDocument
  const scan = hasImage && formData.get("scan") === "on"
  const contactId = asId(formData.get("contact"))
  // A poll is its question and choices as JSON, checked in full by lib/poll-rules.
  const pollField = formData.get("poll")
  const hasPoll = typeof pollField === "string" && pollField !== ""
  const lat = formData.get("lat")
  const lng = formData.get("lng")
  const hasPlace = typeof lat === "string" && typeof lng === "string" && lat !== "" && lng !== ""
  const place = hasPlace ? { lat: Number(lat), lng: Number(lng) } : null
  if (place && (!Number.isFinite(place.lat) || !Number.isFinite(place.lng) || Math.abs(place.lat) > 90 || Math.abs(place.lng) > 180)) {
    return { error: "That place isn't a real location. Try sharing it again." }
  }
  const picks = [hasUpload, contactId !== null, place !== null, hasPoll].filter(Boolean).length
  if (picks > 1) return { error: "Send one photo, file, contact, location or poll at a time." }
  if (!body && !hasUpload && !contactId && !place && !postId && !hasPoll) {
    return { error: "Write a message, or add a photo, file, contact, location or poll." }
  }
  if ([...body].length > MAX_DM) return { error: `Messages can have up to ${MAX_DM} characters.` }
  let poll: Attachment | null = null
  if (hasPoll) {
    let raw: unknown = null
    try {
      raw = JSON.parse(pollField)
    } catch {
      return { error: "That poll isn't valid. Make it again." }
    }
    const checked = pollInput(raw)
    if (!checked.ok) return { error: checked.error }
    poll = {
      kind: "poll",
      question: checked.question,
      options: checked.choices.map((label) => ({ id: newId(), label })),
      multiple: checked.multiple,
    }
  }

  const others = (await memberIds(conversationId)).filter((id) => id !== viewer.id)
  if ((await Promise.all(others.map(async (id) => await blockedEitherWay(viewer.id, id)))).some(Boolean)) {
    return { error: "You can't message someone in this conversation." }
  }
  if (postId && !await sendablePost(postId, viewer.id)) return { error: POST_UNAVAILABLE }
  // A contact is someone else in this conversation, so a card never points outside it.
  if (contactId && (contactId === viewer.id || !others.includes(contactId))) {
    return { error: "Only someone in this conversation can be shared." }
  }

  // A reply has to point at a live message in this same chat. A call record, a timer change, a deleted message or one that
  // has disappeared can't be answered.
  const replyToId = asId(formData.get("replyTo"))
  if (replyToId) {
    const target = await get<{ id: string; sender_id: string }>(
      `SELECT id, sender_id FROM chat_messages
       WHERE id = ? AND conversation_id = ? AND call_status IS NULL AND timer_change IS NULL AND deleted_at IS NULL
         AND (expires_at IS NULL OR expires_at > ?)`,
      replyToId,
      conversationId,
      Date.now()
    )
    if (!target || await blockedEitherWay(viewer.id, target.sender_id)) return { error: "That message can't be replied to anymore." }
  }

  const slowDown =
    await tooFast(`dm:${viewer.id}`, DM_LIMIT, DM_WINDOW_MS, "You're sending messages too fast.") ??
    (hasUpload ? await tooFast(`upload:${viewer.id}`, PHOTO_LIMIT, PHOTO_WINDOW_MS, "You've sent a lot of files.") : null)
  if (slowDown) return { error: slowDown }

  const upload = hasImage
    ? await saveUpload(image, "any")
    : hasVoice
      ? await saveUpload(voice, "audio")
      : hasAudio
        ? await saveUpload(audio, "audio")
        : hasDocument
          ? await saveUpload(document, "document")
          : null
  if (upload && !upload.ok) return { error: upload.error }

  let attachment: Attachment | null = null
  if (scan) attachment = { kind: "scan" }
  else if (hasDocument && document instanceof File) attachment = { kind: "document", name: cleanFileName(document.name), size: document.size }
  else if (contactId) attachment = { kind: "contact", userId: contactId }
  else if (place) attachment = { kind: "location", lat: place.lat, lng: place.lng }
  else if (poll) attachment = poll

  const mediaFile = upload?.ok ? upload.name : null
  try {
    await insertMessage(conversationId, viewer.id, body, mediaFile, postId, replyToId, attachment)
  } catch (error) {
    await removeUpload(mediaFile)
    throw error
  }
  // A text-only message with a link gets the link's preview. The members are told once it has been read, so it shows up
  // without a reload.
  const link = !mediaFile && !attachment && !postId ? firstLink(body) : null
  if (link) {
    void requestPreviews([link], () => {
      void publish([viewer.id, ...others], { type: "message", conversationId }).catch(() => undefined)
    })
  }
  await announceMessage(conversationId, viewer.id, previewOf(body, mediaFile, attachment, postId !== null))
  refresh()
  return { sent: true }
}

// Casts, changes or takes back this viewer's vote in a poll sent in a chat. `choices` is every choice they pick now; none takes
// the vote back. Only someone who is in the chat, and can still see the message, may vote.
export async function voteInChatPoll(messageId: string, choices: unknown): Promise<VoidResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in to vote." }
  const id = asId(messageId)
  if (!id) return { ok: false, error: "That poll isn't here anymore." }
  const message = await get<{ conversation_id: string; attachment: string | null; deleted_at: number | null; expires_at: number | null }>(
    "SELECT conversation_id, attachment, deleted_at, expires_at FROM chat_messages WHERE id = ?",
    id
  )
  if (!message || message.deleted_at !== null || (message.expires_at !== null && message.expires_at <= Date.now())) {
    return { ok: false, error: "That poll isn't here anymore." }
  }
  const status = await memberStatus(message.conversation_id, viewer.id)
  if (status !== "accepted") return { ok: false, error: "Accept this conversation to vote." }
  const poll = parseAttachment(message.attachment)
  if (poll?.kind !== "poll") return { ok: false, error: "That message isn't a poll." }
  const picked = pollVoteInput(choices, poll.options, poll.multiple)
  if (!picked.ok) return { ok: false, error: picked.error }
  const now = Date.now()
  await transaction(async () => {
    await run("DELETE FROM chat_poll_votes WHERE message_id = ? AND user_id = ?", id, viewer.id)
    for (const choice of picked.choices) {
      await run("INSERT INTO chat_poll_votes (message_id, user_id, option_id, created_at) VALUES (?, ?, ?, ?)", id, viewer.id, choice, now)
    }
  })
  await publish(await memberIds(message.conversation_id), { type: "message", conversationId: message.conversation_id })
  refresh()
  return { ok: true }
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
    // Sharing with someone there is no chat with yet starts one, so it passes the same check and limit as a new chat. The
    // share sheet has no human check of its own, so when one is needed the person starts the chat from Messages.
    if (!await directBetween(viewer.id, target.id) && !await blockedEitherWay(viewer.id, target.id)) {
      const reach = await mayReachNewPeople(viewer.id, undefined, 1)
      if (!reach.ok) {
        failed.push({ handle: target.handle, error: reach.proofRequired ? "Start a chat with them from Messages first, then share." : reach.error })
        continue
      }
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
    await insertMessage(opened.id, viewer.id, clean, null, id, null, null)
    await announceMessage(opened.id, viewer.id, previewOf(clean, null, null, true))
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
  return (await searchUsers(clean, viewer.id, 8, { includeMuted: true })).map(({ id, handle, name, avatarFile, verified }) => ({ id, handle, name, avatarFile, verified }))
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
    ? await get<{ conversation_id: string; sender_id: string; deleted_at: number | null; expires_at: number | null }>(
        "SELECT conversation_id, sender_id, deleted_at, expires_at FROM chat_messages WHERE id = ?",
        id
      )
    : undefined
  if (!id || !message || message.deleted_at || isExpired(message.expires_at, Date.now())) return { ok: false, error: "That message was deleted." }
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
  // A forwarded copy can share this file, so it is removed only once no message still points at it.
  if (message.media_file && !(await get("SELECT 1 AS found FROM chat_messages WHERE media_file = ? LIMIT 1", message.media_file))) {
    await removeUpload(message.media_file)
  }
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

// Pins or unpins a chat at the top of this viewer's list. A person can pin PINNED_CHATS_MAX chats at most.
export async function toggleConversationPin(conversationId: string): Promise<VoidResult & { pinned?: boolean }> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  const id = asId(conversationId)
  const member = id
    ? await get<{ status: string; pinned: number }>("SELECT status, pinned FROM conversation_members WHERE conversation_id = ? AND user_id = ?", id, viewer.id)
    : undefined
  if (!id || !member || member.status !== "accepted") return { ok: false, error: "That conversation doesn't exist." }
  const pinned = member.pinned === 1 ? 0 : 1
  if (pinned === 1) {
    const count = (
      await get<{ c: number }>(
        "SELECT COUNT(*) AS c FROM conversation_members WHERE user_id = ? AND status = 'accepted' AND archived = 0 AND pinned = 1",
        viewer.id
      )
    )?.c ?? 0
    if (count >= PINNED_CHATS_MAX) return { ok: false, error: `You can pin up to ${PINNED_CHATS_MAX} chats. Unpin one first.` }
  }
  await run("UPDATE conversation_members SET pinned = ? WHERE conversation_id = ? AND user_id = ?", pinned, id, viewer.id)
  refresh()
  return { ok: true, pinned: pinned === 1 }
}

// Archives or restores a chat for this viewer only. An archived chat leaves the chats list and comes back when someone else sends
// a message in it. Archiving also unpins it.
export async function toggleConversationArchive(conversationId: string): Promise<VoidResult & { archived?: boolean }> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  const id = asId(conversationId)
  const member = id
    ? await get<{ status: string; archived: number }>("SELECT status, archived FROM conversation_members WHERE conversation_id = ? AND user_id = ?", id, viewer.id)
    : undefined
  if (!id || !member || member.status !== "accepted") return { ok: false, error: "That conversation doesn't exist." }
  const archived = member.archived === 1 ? 0 : 1
  await run("UPDATE conversation_members SET archived = ? WHERE conversation_id = ? AND user_id = ?", archived, id, viewer.id)
  if (archived === 1) await run("UPDATE conversation_members SET pinned = 0 WHERE conversation_id = ? AND user_id = ?", id, viewer.id)
  refresh()
  return { ok: true, archived: archived === 1 }
}

// The message a viewer can act on: it exists, they may read its chat, and they have not deleted it for themselves. Null otherwise.
async function visibleMessageFor(messageId: string | null, viewerId: string): Promise<{ conversation_id: string; body: string; media_file: string | null; post_id: string | null; attachment: string | null; deleted_at: number | null; call_status: string | null; timer_change: number | null; expires_at: number | null } | null> {
  if (!messageId) return null
  const message = await get<{ conversation_id: string; body: string; media_file: string | null; post_id: string | null; attachment: string | null; deleted_at: number | null; call_status: string | null; timer_change: number | null; expires_at: number | null }>(
    "SELECT conversation_id, body, media_file, post_id, attachment, deleted_at, call_status, timer_change, expires_at FROM chat_messages WHERE id = ?",
    messageId
  )
  if (!message || !(await canReadConversation(message.conversation_id, viewerId))) return null
  if (await get("SELECT 1 AS found FROM chat_hidden_messages WHERE message_id = ? AND user_id = ?", messageId, viewerId)) return null
  if (message.expires_at !== null && message.expires_at <= Date.now()) return null
  return message
}

// Stars or unstars a message for this viewer alone. Calls and changes to the timer are not messages anyone stars.
export async function toggleStarMessage(messageId: string): Promise<VoidResult & { starred?: boolean }> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  const id = asId(messageId)
  const message = await visibleMessageFor(id, viewer.id)
  if (!id || !message) return { ok: false, error: "That message doesn't exist." }
  if (message.deleted_at !== null || message.call_status !== null || message.timer_change !== null) {
    return { ok: false, error: "This message can't be starred." }
  }
  const starred = await get("SELECT 1 AS found FROM chat_stars WHERE user_id = ? AND message_id = ?", viewer.id, id)
  if (starred) await run("DELETE FROM chat_stars WHERE user_id = ? AND message_id = ?", viewer.id, id)
  else await run("INSERT INTO chat_stars (user_id, message_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING", viewer.id, id, Date.now())
  refresh()
  return { ok: true, starred: !starred }
}

// Removes a message from this viewer's own view only. It stays for everyone else in the chat, and can't be undone from here.
export async function hideMessageForMe(messageId: string): Promise<VoidResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  const id = asId(messageId)
  const message = id
    ? await get<{ conversation_id: string }>("SELECT conversation_id FROM chat_messages WHERE id = ?", id)
    : undefined
  if (!id || !message || !(await canReadConversation(message.conversation_id, viewer.id))) return { ok: false, error: "That message doesn't exist." }
  await run("INSERT INTO chat_hidden_messages (user_id, message_id) VALUES (?, ?) ON CONFLICT DO NOTHING", viewer.id, id)
  await publish([viewer.id], { type: "message", conversationId: message.conversation_id })
  refresh()
  return { ok: true }
}

export type ForwardTarget = { id: string; title: string; kind: "dm" | "group" }

// The chats a viewer can forward to: every chat they are in, archived ones included, in the order the chats list uses.
export async function listForwardTargets(): Promise<ForwardTarget[]> {
  const viewer = await getAgreedViewer()
  if (!viewer) return []
  const chats = [...(await conversationSummaries(viewer.id, "accepted")), ...(await conversationSummaries(viewer.id, "accepted", 60, true))]
  return chats.map((chat) => {
    const names = chat.others.map((person) => person.name).join(", ")
    const title = chat.kind === "group" ? chat.title || names || "Group" : (chat.others[0]?.name ?? "Conversation")
    return { id: chat.id, title, kind: chat.kind }
  })
}

// Sends a copy of a message to each chosen chat, in the viewer's name, marked as forwarded. The copy keeps its text, photo, file,
// place, post or contact. A contact card goes only where that person is. Polls, calls and timer changes can't be forwarded.
export async function forwardMessage(messageId: string, targets: unknown): Promise<VoidResult & { count?: number }> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  const id = asId(messageId)
  const message = await visibleMessageFor(id, viewer.id)
  if (!id || !message) return { ok: false, error: "That message doesn't exist." }
  const attachment = parseAttachment(message.attachment)
  const refused = forwardRefusal({
    deleted: message.deleted_at !== null,
    callStatus: message.call_status,
    timerChange: message.timer_change,
    attachmentKind: attachment?.kind ?? null,
  })
  if (refused) return { ok: false, error: refused }
  const chosen = forwardTargetsInput(targets)
  if (!chosen.ok) return { ok: false, error: chosen.error }
  if (message.post_id && !(await sendablePost(message.post_id, viewer.id))) return { ok: false, error: POST_UNAVAILABLE }

  for (const conversationId of chosen.ids) {
    if ((await memberStatus(conversationId, viewer.id)) !== "accepted") return { ok: false, error: "You can only forward to chats you're in." }
    if (await directConversationClosed(conversationId, viewer.id)) return { ok: false, error: "They can't receive messages here anymore." }
    const others = (await memberIds(conversationId)).filter((memberId) => memberId !== viewer.id)
    if ((await Promise.all(others.map((memberId) => blockedEitherWay(viewer.id, memberId)))).some(Boolean)) {
      return { ok: false, error: "You can't message someone in one of those chats." }
    }
    if (attachment?.kind === "contact" && !others.includes(attachment.userId)) {
      return { ok: false, error: "A contact card can only go to a chat with that person in it." }
    }
  }
  const slowDown = await tooFast(`dm:${viewer.id}`, DM_LIMIT, DM_WINDOW_MS, "You're sending messages too fast.")
  if (slowDown) return { ok: false, error: slowDown }

  for (const conversationId of chosen.ids) {
    await insertMessage(conversationId, viewer.id, message.body, message.media_file, message.post_id, null, attachment, true)
    await announceMessage(conversationId, viewer.id, previewOf(message.body, message.media_file, attachment, message.post_id !== null))
  }
  refresh()
  return { ok: true, count: chosen.ids.length }
}

// A person can change a conversation's timer this many times in TIMER_WINDOW_MS. Each change writes a line in the thread.
const TIMER_LIMIT = 10
const TIMER_WINDOW_MS = 10 * 60 * 1000

// Sets the disappearing-messages timer for everyone in the conversation, and records the change in the thread. Anyone who
// has joined it can. The timer applies to messages sent from now on; messages already sent keep the timer they had.
export async function setMessageTimer(conversationId: string, timer: number): Promise<VoidResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  const id = asId(conversationId)
  const status = id ? await memberStatus(id, viewer.id) : null
  if (!id || !status || !await canReadConversation(id, viewer.id)) return { ok: false, error: "That conversation doesn't exist." }
  if (status !== "accepted") return { ok: false, error: "Accept this conversation first." }
  if (await directConversationClosed(id, viewer.id)) return { ok: false, error: "They can't receive messages here anymore." }
  const next = asMessageTimer(timer)
  if (next === null) return { ok: false, error: "Choose Off, 24 hours, 7 days or 30 days." }
  const current = (await get<{ message_timer: number }>("SELECT message_timer FROM conversations WHERE id = ?", id))?.message_timer ?? 0
  if (current === next) return { ok: true }
  const slowDown = await tooFast(`timer:${viewer.id}`, TIMER_LIMIT, TIMER_WINDOW_MS, "You've changed disappearing messages a lot.")
  if (slowDown) return { ok: false, error: slowDown }

  const now = Date.now()
  await transaction(async () => {
    await run("UPDATE conversations SET message_timer = ?, updated_at = ? WHERE id = ?", next, now, id)
    // The record of the change is a line in the thread, and it stays when the timer is on: it is not a message to expire.
    await run(
      "INSERT INTO chat_messages (id, conversation_id, sender_id, body, created_at, lang, timer_change) VALUES (?, ?, ?, '', ?, '', ?)",
      newId(),
      id,
      viewer.id,
      now,
      next
    )
    await run("UPDATE conversation_members SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?", now, id, viewer.id)
  })
  await publish(await memberIds(id), { type: "message", conversationId: id })
  refresh()
  return { ok: true }
}
