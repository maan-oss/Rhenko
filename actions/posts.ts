"use server"

import { revalidatePath } from "next/cache"
import { getViewer, newId } from "@/lib/auth"
import { all, get, run, transaction } from "@/lib/db"
import { editHistoryFor, type EditVersion } from "@/lib/data"
import { notify } from "@/lib/notify"
import { announcePost, mediaFilesFor, removeFiles, replyPermission, thread } from "@/lib/post-writes"
import {
  EDIT_WINDOW_MS,
  MAX_ALT,
  MAX_HIGHLIGHTS,
  MAX_IMAGES,
  MAX_MUTED_WORD,
  MAX_FOLDER_NAME,
  MAX_VIDEOS,
  REPLY_SETTINGS,
  REPORT_REASONS,
  UNDO_WINDOW_MS,
  validatePoll,
  validatePost,
  validateSchedule,
  type ReplySetting,
} from "@/lib/rules"
import { saveUpload, type MediaKind } from "@/lib/uploads"

export type CreateResult = { ok: true; id: string; status: "published" | "draft" | "scheduled" } | { ok: false; error: string }
export type ToggleResult = { ok: true; active: boolean } | { ok: false; error: string }
export type VoidResult = { ok: true } | { ok: false; error: string }
export type IdResult = { ok: true; id: string } | { ok: false; error: string }

function refresh() {
  revalidatePath("/", "layout")
}

function text(value: FormDataEntryValue | null): string | null {
  return typeof value === "string" && value !== "" ? value : null
}

function parseReplySetting(value: string | null): ReplySetting {
  return (REPLY_SETTINGS as readonly string[]).includes(value ?? "") ? (value as ReplySetting) : "everyone"
}

export async function createPost(formData: FormData): Promise<CreateResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in to post." }

  const body = String(formData.get("body") ?? "").replace(/\r\n/g, "\n").trim()
  const files = formData.getAll("media").filter((f): f is File => f instanceof File && f.size > 0)
  const alts = formData.getAll("alt").map((v) => String(v).trim().slice(0, MAX_ALT))
  const wantsPoll = formData.get("poll") === "on"
  const pollOptions = formData.getAll("pollOption").map((v) => String(v).trim()).filter((v) => v.length > 0)
  const pollMinutes = Number(formData.get("pollMinutes") ?? 0)
  const sensitive = formData.get("sensitive") === "on"
  const draft = formData.get("draft") === "on"
  const scheduleRaw = text(formData.get("scheduleAt"))
  const scheduleAt = scheduleRaw && !draft ? Number(scheduleRaw) : null
  const replyTo = text(formData.get("replyTo"))
  const quoteOf = text(formData.get("quoteOf"))
  const replySetting = replyTo ? "everyone" : parseReplySetting(text(formData.get("replySetting")))

  const videos = files.filter((f) => f.type.startsWith("video/")).length
  const images = files.length - videos
  if (videos > MAX_VIDEOS || (videos > 0 && images > 0)) return { ok: false, error: "Add one video, or up to four images." }
  if (images > MAX_IMAGES) return { ok: false, error: `Add up to ${MAX_IMAGES} images.` }
  if (wantsPoll && files.length > 0) return { ok: false, error: "Polls can't include media." }

  const validation = validatePost(body, files.length, wantsPoll)
  if (validation) return { ok: false, error: validation }
  if (wantsPoll) {
    const pollError = validatePoll(pollOptions, pollMinutes)
    if (pollError) return { ok: false, error: pollError }
  }
  if (scheduleAt !== null) {
    const scheduleError = validateSchedule(scheduleAt, Date.now())
    if (scheduleError) return { ok: false, error: scheduleError }
  }

  if (replyTo) {
    const parent = get<{ is_draft: number; publish_at: number | null }>("SELECT is_draft, publish_at FROM posts WHERE id = ?", replyTo)
    if (!parent || parent.is_draft === 1 || parent.publish_at !== null) return { ok: false, error: "That post was deleted." }
    const permission = replyPermission(viewer.id, replyTo)
    if (!permission.ok) return { ok: false, error: permission.error }
  }
  if (quoteOf) {
    const quoted = get<{ is_draft: number; publish_at: number | null }>("SELECT is_draft, publish_at FROM posts WHERE id = ?", quoteOf)
    if (!quoted || quoted.is_draft === 1 || quoted.publish_at !== null) return { ok: false, error: "That post was deleted." }
  }

  const saved: { file: string; kind: MediaKind; alt: string }[] = []
  for (let i = 0; i < files.length; i++) {
    const upload = await saveUpload(files[i])
    if (!upload) continue
    if (!upload.ok) {
      removeFiles(saved.map((s) => s.file))
      return { ok: false, error: upload.error }
    }
    saved.push({ file: upload.name, kind: upload.kind, alt: alts[i] ?? "" })
  }

  const now = Date.now()
  const id = newId()
  const status = draft ? "draft" : scheduleAt !== null ? "scheduled" : "published"
  const publishAt = status === "scheduled" ? scheduleAt : null
  transaction(() => {
    run(
      `INSERT INTO posts (id, author_id, body, reply_to_id, quote_of_id, media_file, created_at, reply_setting, sensitive, publish_at, is_draft)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
      id,
      viewer.id,
      body,
      replyTo,
      quoteOf,
      now,
      replySetting,
      sensitive ? 1 : 0,
      publishAt,
      draft ? 1 : 0
    )
    saved.forEach((media, position) => {
      run(
        "INSERT INTO post_media (id, post_id, file, kind, alt, position) VALUES (?, ?, ?, ?, ?, ?)",
        newId(),
        id,
        media.file,
        media.kind,
        media.alt,
        position
      )
    })
    if (wantsPoll) {
      const endsAt = (scheduleAt ?? now) + pollMinutes * 60 * 1000
      run("INSERT INTO polls (post_id, ends_at) VALUES (?, ?)", id, endsAt)
      pollOptions.forEach((label, position) => {
        run("INSERT INTO poll_options (id, post_id, position, label) VALUES (?, ?, ?, ?)", newId(), id, position, label)
      })
    }
  })

  if (status === "published") {
    announcePost({ id, author_id: viewer.id, body, reply_to_id: replyTo, quote_of_id: quoteOf })
  }
  refresh()
  return { ok: true, id, status }
}

// Editing is allowed for a short window after a post goes live.
export async function editPost(postId: string, formData: FormData): Promise<VoidResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in to edit posts." }
  const post = get<{
    author_id: string
    created_at: number
    is_draft: number
    publish_at: number | null
    body: string
    edited_at: number | null
  }>("SELECT author_id, created_at, is_draft, publish_at, body, edited_at FROM posts WHERE id = ?", postId)
  if (!post) return { ok: false, error: "That post was deleted." }
  if (post.author_id !== viewer.id) return { ok: false, error: "You can only edit your own posts." }
  if (post.is_draft === 1 || post.publish_at !== null) return { ok: false, error: "Publish this post before editing it." }
  if (Date.now() - post.created_at > EDIT_WINDOW_MS) return { ok: false, error: "Posts can be edited for 30 minutes after they're posted." }

  const body = String(formData.get("body") ?? "").replace(/\r\n/g, "\n").trim()
  const media = all<{ id: string }>("SELECT id FROM post_media WHERE post_id = ?", postId)
  const hasPoll = get("SELECT 1 AS found FROM polls WHERE post_id = ?", postId) !== undefined
  const validation = validatePost(body, media.length, hasPoll)
  if (validation) return { ok: false, error: validation }

  transaction(() => {
    // The text being replaced is kept, dated to when it was written, for the edit history.
    if (body !== post.body) {
      run(
        "INSERT INTO post_edits (id, post_id, body, created_at) VALUES (?, ?, ?, ?)",
        newId(),
        postId,
        post.body,
        post.edited_at ?? post.created_at
      )
    }
    run("UPDATE posts SET body = ?, edited_at = ? WHERE id = ?", body, Date.now(), postId)
    for (const item of media) {
      const raw = formData.get(`alt-${item.id}`)
      if (typeof raw === "string") {
        run("UPDATE post_media SET alt = ? WHERE id = ?", raw.trim().slice(0, MAX_ALT), item.id)
      }
    }
  })
  refresh()
  return { ok: true }
}

function postAuthor(postId: string): string | null {
  return get<{ author_id: string }>("SELECT author_id FROM posts WHERE id = ?", postId)?.author_id ?? null
}

export async function deletePost(postId: string): Promise<VoidResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in to delete posts." }
  const author = postAuthor(postId)
  if (!author) return { ok: false, error: "That post was deleted." }
  if (author !== viewer.id) return { ok: false, error: "You can only delete your own posts." }

  // Replies go with their parent, so their media is removed too.
  const files = mediaFilesFor(thread(postId))
  run("DELETE FROM posts WHERE id = ? AND author_id = ?", postId, viewer.id)
  removeFiles(files)
  refresh()
  return { ok: true }
}

// Takes back a post moments after it went out, while the undo window is open.
export async function undoPost(postId: string): Promise<VoidResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  const post = get<{ author_id: string; created_at: number }>("SELECT author_id, created_at FROM posts WHERE id = ?", postId)
  if (!post || post.author_id !== viewer.id) return { ok: false, error: "That post was deleted." }
  if (Date.now() - post.created_at > UNDO_WINDOW_MS) return { ok: false, error: "The undo window has closed." }
  const files = mediaFilesFor(thread(postId))
  run("DELETE FROM posts WHERE id = ? AND author_id = ?", postId, viewer.id)
  removeFiles(files)
  refresh()
  return { ok: true }
}

// The author of a post can hide replies to it. Hidden replies stay visible to the
// person who wrote them and to the post's author, and are hidden from everyone else.
export async function setReplyHidden(replyId: string, hidden: boolean): Promise<VoidResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  const reply = get<{ reply_to_id: string | null }>("SELECT reply_to_id FROM posts WHERE id = ?", replyId)
  if (!reply?.reply_to_id) return { ok: false, error: "That reply was deleted." }
  const parentAuthor = postAuthor(reply.reply_to_id)
  if (parentAuthor !== viewer.id) return { ok: false, error: "Only the author of the post can hide its replies." }
  run("UPDATE posts SET hidden_by_parent = ? WHERE id = ?", hidden ? 1 : 0, replyId)
  refresh()
  return { ok: true }
}

export type EditHistoryResult = { ok: true; versions: EditVersion[] } | { ok: false; error: string }

export async function getEditHistory(postId: string): Promise<EditHistoryResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in to see edit history." }
  const versions = editHistoryFor(postId)
  if (versions.length === 0) return { ok: false, error: "That post was deleted." }
  return { ok: true, versions }
}

export async function publishNow(postId: string): Promise<VoidResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in to publish." }
  const post = get<{ author_id: string; body: string; reply_to_id: string | null; quote_of_id: string | null; is_draft: number; publish_at: number | null }>(
    "SELECT author_id, body, reply_to_id, quote_of_id, is_draft, publish_at FROM posts WHERE id = ?",
    postId
  )
  if (!post || post.author_id !== viewer.id) return { ok: false, error: "That post was deleted." }
  if (post.is_draft === 0 && post.publish_at === null) return { ok: false, error: "That post is already live." }
  const now = Date.now()
  run("UPDATE posts SET is_draft = 0, publish_at = NULL, created_at = ? WHERE id = ?", now, postId)
  announcePost({ id: postId, author_id: viewer.id, body: post.body, reply_to_id: post.reply_to_id, quote_of_id: post.quote_of_id })
  refresh()
  return { ok: true }
}

export async function toggleLike(postId: string): Promise<ToggleResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in to like posts." }
  const author = postAuthor(postId)
  if (!author) return { ok: false, error: "That post was deleted." }

  const existing = get("SELECT 1 AS found FROM likes WHERE user_id = ? AND post_id = ?", viewer.id, postId)
  if (existing) {
    run("DELETE FROM likes WHERE user_id = ? AND post_id = ?", viewer.id, postId)
    run("DELETE FROM notifications WHERE actor_id = ? AND post_id = ? AND kind = 'like'", viewer.id, postId)
    refresh()
    return { ok: true, active: false }
  }
  run("INSERT INTO likes (user_id, post_id, created_at) VALUES (?, ?, ?)", viewer.id, postId, Date.now())
  notify(author, viewer.id, "like", postId)
  refresh()
  return { ok: true, active: true }
}

export async function toggleRepost(postId: string): Promise<ToggleResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in to repost." }
  const author = postAuthor(postId)
  if (!author) return { ok: false, error: "That post was deleted." }

  const existing = get("SELECT 1 AS found FROM reposts WHERE user_id = ? AND post_id = ?", viewer.id, postId)
  if (existing) {
    run("DELETE FROM reposts WHERE user_id = ? AND post_id = ?", viewer.id, postId)
    run("DELETE FROM notifications WHERE actor_id = ? AND post_id = ? AND kind = 'repost'", viewer.id, postId)
    refresh()
    return { ok: true, active: false }
  }
  run("INSERT INTO reposts (user_id, post_id, created_at) VALUES (?, ?, ?)", viewer.id, postId, Date.now())
  notify(author, viewer.id, "repost", postId)
  refresh()
  return { ok: true, active: true }
}

export async function toggleBookmark(postId: string): Promise<ToggleResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in to bookmark posts." }
  if (!postAuthor(postId)) return { ok: false, error: "That post was deleted." }

  const existing = get("SELECT 1 AS found FROM bookmarks WHERE user_id = ? AND post_id = ?", viewer.id, postId)
  if (existing) {
    run("DELETE FROM bookmarks WHERE user_id = ? AND post_id = ?", viewer.id, postId)
    refresh()
    return { ok: true, active: false }
  }
  run("INSERT INTO bookmarks (user_id, post_id, created_at) VALUES (?, ?, ?)", viewer.id, postId, Date.now())
  refresh()
  return { ok: true, active: true }
}

export async function moveBookmark(postId: string, folderId: string | null): Promise<VoidResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  if (folderId) {
    const owned = get("SELECT 1 AS found FROM bookmark_folders WHERE id = ? AND user_id = ?", folderId, viewer.id)
    if (!owned) return { ok: false, error: "That folder doesn't exist." }
  }
  const updated = get<{ c: number }>("SELECT COUNT(*) AS c FROM bookmarks WHERE user_id = ? AND post_id = ?", viewer.id, postId)
  if (!updated || updated.c === 0) return { ok: false, error: "Bookmark this post first." }
  run("UPDATE bookmarks SET folder_id = ? WHERE user_id = ? AND post_id = ?", folderId, viewer.id, postId)
  refresh()
  return { ok: true }
}

export async function createFolder(formData: FormData): Promise<IdResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  const name = String(formData.get("name") ?? "").trim()
  if (!name) return { ok: false, error: "Name the folder." }
  if (name.length > MAX_FOLDER_NAME) return { ok: false, error: `Folder names can have up to ${MAX_FOLDER_NAME} characters.` }
  const id = newId()
  run("INSERT INTO bookmark_folders (id, user_id, name, created_at) VALUES (?, ?, ?, ?)", id, viewer.id, name, Date.now())
  refresh()
  return { ok: true, id }
}

export async function deleteFolder(folderId: string): Promise<VoidResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  run("DELETE FROM bookmark_folders WHERE id = ? AND user_id = ?", folderId, viewer.id)
  refresh()
  return { ok: true }
}

export async function pinPost(postId: string | null): Promise<VoidResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  if (postId) {
    const post = get<{ author_id: string; reply_to_id: string | null }>("SELECT author_id, reply_to_id FROM posts WHERE id = ?", postId)
    if (!post || post.author_id !== viewer.id) return { ok: false, error: "You can only pin your own posts." }
    if (post.reply_to_id) return { ok: false, error: "Replies can't be pinned." }
  }
  run("UPDATE users SET pinned_post_id = ? WHERE id = ?", postId, viewer.id)
  refresh()
  return { ok: true }
}

export async function toggleHighlight(postId: string): Promise<ToggleResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  const author = postAuthor(postId)
  if (!author) return { ok: false, error: "That post was deleted." }
  if (author !== viewer.id) return { ok: false, error: "You can only highlight your own posts." }
  const existing = get("SELECT 1 AS found FROM highlights WHERE user_id = ? AND post_id = ?", viewer.id, postId)
  if (existing) {
    run("DELETE FROM highlights WHERE user_id = ? AND post_id = ?", viewer.id, postId)
    refresh()
    return { ok: true, active: false }
  }
  const count = get<{ c: number }>("SELECT COUNT(*) AS c FROM highlights WHERE user_id = ?", viewer.id)?.c ?? 0
  if (count >= MAX_HIGHLIGHTS) return { ok: false, error: `You can highlight up to ${MAX_HIGHLIGHTS} posts.` }
  run("INSERT INTO highlights (user_id, post_id, created_at) VALUES (?, ?, ?)", viewer.id, postId, Date.now())
  refresh()
  return { ok: true, active: true }
}

export async function votePoll(postId: string, optionId: string): Promise<VoidResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in to vote." }
  const poll = get<{ ends_at: number }>("SELECT ends_at FROM polls WHERE post_id = ?", postId)
  if (!poll) return { ok: false, error: "That poll was deleted." }
  if (poll.ends_at <= Date.now()) return { ok: false, error: "This poll has ended." }
  const option = get("SELECT 1 AS found FROM poll_options WHERE id = ? AND post_id = ?", optionId, postId)
  if (!option) return { ok: false, error: "That choice doesn't exist." }
  const voted = get("SELECT 1 AS found FROM poll_votes WHERE post_id = ? AND user_id = ?", postId, viewer.id)
  if (voted) return { ok: false, error: "You already voted in this poll." }
  run("INSERT INTO poll_votes (post_id, user_id, option_id, created_at) VALUES (?, ?, ?, ?)", postId, viewer.id, optionId, Date.now())
  refresh()
  return { ok: true }
}

// Counts a view once per viewer. The feed calls this as posts scroll into view.
export async function recordViews(postIds: string[]): Promise<void> {
  const viewer = await getViewer()
  if (!viewer) return
  const now = Date.now()
  // A post can be deleted between the page render and this call, so only live rows are counted.
  for (const id of [...new Set(postIds)].slice(0, 50)) {
    run(
      "INSERT OR IGNORE INTO post_views (post_id, viewer_id, created_at) SELECT id, ?, ? FROM posts WHERE id = ?",
      viewer.id,
      now,
      id
    )
  }
}

export async function reportPost(postId: string, reason: string): Promise<VoidResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in to report posts." }
  if (!postAuthor(postId)) return { ok: false, error: "That post was deleted." }
  if (!(REPORT_REASONS as readonly string[]).includes(reason)) return { ok: false, error: "Pick a reason." }
  run(
    "INSERT INTO reports (id, reporter_id, post_id, user_id, reason, created_at) VALUES (?, ?, ?, NULL, ?, ?)",
    newId(),
    viewer.id,
    postId,
    reason,
    Date.now()
  )
  return { ok: true }
}

export async function addMutedWord(word: string): Promise<VoidResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  const clean = word.trim().replace(/^#/, "").toLowerCase()
  if (!clean) return { ok: false, error: "Enter a word or phrase." }
  if (clean.length > MAX_MUTED_WORD) return { ok: false, error: `Muted words can have up to ${MAX_MUTED_WORD} characters.` }
  run("INSERT OR IGNORE INTO muted_words (user_id, word, created_at) VALUES (?, ?, ?)", viewer.id, clean, Date.now())
  refresh()
  return { ok: true }
}

export async function removeMutedWord(word: string): Promise<VoidResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  run("DELETE FROM muted_words WHERE user_id = ? AND word = ?", viewer.id, word)
  refresh()
  return { ok: true }
}
