"use server"

import { revalidatePath } from "next/cache"
import { getViewer, newId } from "@/lib/auth"
import { all, get, run, transaction } from "@/lib/db"
import { canSeeLivePost, canSeePost, editHistoryFor, visiblePostIds, type EditVersion } from "@/lib/data"
import { notify } from "@/lib/notify"
import { hidePost } from "@/lib/moderation"
import { announcePost, mediaFilesFor, removeFiles, replyPermission, startPollClock, thread } from "@/lib/post-writes"
import { consume, waitLabel } from "@/lib/rate-limit"
import {
  asReplySetting,
  EDIT_WINDOW_MS,
  MAX_ALT,
  MAX_HIGHLIGHTS,
  MAX_IMAGES,
  MAX_MUTED_WORD,
  MAX_FOLDER_NAME,
  MAX_VIDEOS,
  POST_UNAVAILABLE,
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

// Posting limits: posts and drafts per minute, and photos and videos per hour.
const POST_LIMIT = 30
const POST_WINDOW_MS = 60_000
const UPLOAD_LIMIT = 60
const UPLOAD_WINDOW_MS = 60 * 60_000

function refresh() {
  revalidatePath("/", "layout")
}

function text(value: FormDataEntryValue | null): string | null {
  return typeof value === "string" && value !== "" ? value : null
}

// Ids arrive from the browser, so anything that isn't a short string is turned away before it reaches the database.
function isId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 100
}

export async function createPost(formData: FormData): Promise<CreateResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in to post." }
  const allowed = consume(`post:${viewer.id}`, POST_LIMIT, POST_WINDOW_MS)
  if (!allowed.ok) return { ok: false, error: `You've posted a lot in the last minute. Try again in ${waitLabel(allowed.retryAfterSeconds)}.` }

  const body = String(formData.get("body") ?? "").replace(/\r\n/g, "\n").trim()
  // Each file is paired with the alt text sent with it, in the same order, for photos and videos alike.
  const alts = formData.getAll("alt")
  const picked = formData
    .getAll("media")
    .flatMap((value, index) => (value instanceof File && value.size > 0 ? [{ file: value, alt: String(alts[index] ?? "").trim().slice(0, MAX_ALT) }] : []))
  const wantsPoll = formData.get("poll") === "on"
  const pollOptions = formData.getAll("pollOption").map((v) => String(v).trim()).filter((v) => v.length > 0)
  const pollMinutes = Number(formData.get("pollMinutes") ?? 0)
  const sensitive = formData.get("sensitive") === "on"
  const draft = formData.get("draft") === "on"
  const scheduleRaw = text(formData.get("scheduleAt"))
  const scheduleAt = scheduleRaw && !draft ? Number(scheduleRaw) : null
  const replyTo = text(formData.get("replyTo"))
  const quoteOf = text(formData.get("quoteOf"))

  const videos = picked.filter((m) => m.file.type.startsWith("video/")).length
  const images = picked.length - videos
  if (videos > MAX_VIDEOS || (videos > 0 && images > 0)) return { ok: false, error: "Add one video, or up to four images." }
  if (images > MAX_IMAGES) return { ok: false, error: `Add up to ${MAX_IMAGES} images.` }
  if (wantsPoll && picked.length > 0) return { ok: false, error: "Polls can't include media." }

  const validation = validatePost(body, picked.length, wantsPoll)
  if (validation) return { ok: false, error: validation }
  if (wantsPoll) {
    const pollError = validatePoll(pollOptions, pollMinutes)
    if (pollError) return { ok: false, error: pollError }
  }
  if (scheduleAt !== null) {
    const scheduleError = validateSchedule(scheduleAt, Date.now())
    if (scheduleError) return { ok: false, error: scheduleError }
  }

  // The post this answers or quotes is checked before any file is saved.
  let replySetting: ReplySetting = asReplySetting(text(formData.get("replySetting")))
  if (replyTo !== null) {
    if (draft || scheduleAt !== null) return { ok: false, error: "Replies go out right away, so they can't be saved as drafts or scheduled." }
    const permission = isId(replyTo) ? replyPermission(viewer.id, replyTo) : { ok: false as const, error: POST_UNAVAILABLE }
    if (!permission.ok) return { ok: false, error: permission.error }
    // A reply takes the reply setting of the post it answers.
    replySetting = permission.setting
  }
  if (quoteOf !== null && (!isId(quoteOf) || !canSeeLivePost(quoteOf, viewer.id))) return { ok: false, error: POST_UNAVAILABLE }

  for (let i = 0; i < picked.length; i++) {
    const room = consume(`upload:${viewer.id}`, UPLOAD_LIMIT, UPLOAD_WINDOW_MS)
    if (!room.ok) {
      return { ok: false, error: `You've added a lot of photos and videos in the last hour. Try again in ${waitLabel(room.retryAfterSeconds)}.` }
    }
  }

  // From here on, every way out without a post removes the files saved for it.
  const saved: { file: string; kind: MediaKind; alt: string }[] = []
  const discard = () => removeFiles(saved.map((s) => s.file))
  try {
    for (const item of picked) {
      const upload = await saveUpload(item.file)
      if (!upload) continue
      if (!upload.ok) {
        discard()
        return { ok: false, error: upload.error }
      }
      saved.push({ file: upload.name, kind: upload.kind, alt: item.alt })
    }
  } catch (error) {
    discard()
    console.error("[posts] saving media failed", error)
    return { ok: false, error: "Your photos or video couldn't be saved. Try again." }
  }

  const now = Date.now()
  const id = newId()
  const status = draft ? "draft" : scheduleAt !== null ? "scheduled" : "published"
  const publishAt = status === "scheduled" ? scheduleAt : null
  try {
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
        // The length is kept, so a draft's poll can start its clock when the draft is published.
        const durationMs = pollMinutes * 60 * 1000
        run("INSERT INTO polls (post_id, ends_at, duration_ms) VALUES (?, ?, ?)", id, (publishAt ?? now) + durationMs, durationMs)
        pollOptions.forEach((label, position) => {
          run("INSERT INTO poll_options (id, post_id, position, label) VALUES (?, ?, ?, ?)", newId(), id, position, label)
        })
      }
    })
  } catch (error) {
    discard()
    console.error("[posts] saving the post failed", error)
    return { ok: false, error: "Your post couldn't be saved. Try again." }
  }

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
  if (!isId(postId)) return { ok: false, error: "That post was deleted." }
  const post = get<{
    author_id: string
    created_at: number
    is_draft: number
    publish_at: number | null
    body: string
    edited_at: number | null
    removed_at: number | null
  }>("SELECT author_id, created_at, is_draft, publish_at, body, edited_at, removed_at FROM posts WHERE id = ?", postId)
  if (!post) return { ok: false, error: "That post was deleted." }
  if (post.removed_at !== null) return { ok: false, error: POST_UNAVAILABLE }
  if (post.author_id !== viewer.id) return { ok: false, error: "You can only edit your own posts." }
  if (post.is_draft === 1 || post.publish_at !== null) return { ok: false, error: "Publish this post before editing it." }
  if (Date.now() - post.created_at > EDIT_WINDOW_MS) return { ok: false, error: "Posts can be edited for 30 minutes after they're posted." }

  const body = String(formData.get("body") ?? "").replace(/\r\n/g, "\n").trim()
  const media = all<{ id: string }>("SELECT id FROM post_media WHERE post_id = ?", postId)
  const hasPoll = get("SELECT 1 AS found FROM polls WHERE post_id = ?", postId) !== undefined
  const validation = validatePost(body, media.length, hasPoll)
  if (validation) return { ok: false, error: validation }

  transaction(() => {
    // Only a changed text counts as an edit: it is marked as edited and the text being replaced is kept, dated to
    // when it was written, for the edit history. Changing only the alt text leaves the post as it was.
    const changed = body !== post.body
    if (changed) {
      run(
        "INSERT INTO post_edits (id, post_id, body, created_at) VALUES (?, ?, ?, ?)",
        newId(),
        postId,
        post.body,
        post.edited_at ?? post.created_at
      )
    }
    run("UPDATE posts SET body = ?, edited_at = ? WHERE id = ?", body, changed ? Date.now() : post.edited_at, postId)
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
  const author = isId(postId) ? postAuthor(postId) : null
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
  const post = isId(postId) ? get<{ author_id: string; created_at: number }>("SELECT author_id, created_at FROM posts WHERE id = ?", postId) : undefined
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
  const reply = isId(replyId) ? get<{ reply_to_id: string | null }>("SELECT reply_to_id FROM posts WHERE id = ?", replyId) : undefined
  if (!reply?.reply_to_id) return { ok: false, error: "That reply was deleted." }
  const parentAuthor = postAuthor(reply.reply_to_id)
  if (parentAuthor !== viewer.id) return { ok: false, error: "Only the author of the post can hide its replies." }
  run("UPDATE posts SET hidden_by_parent = ? WHERE id = ?", hidden === true ? 1 : 0, replyId)
  refresh()
  return { ok: true }
}

export type EditHistoryResult = { ok: true; versions: EditVersion[] } | { ok: false; error: string }

// Earlier versions of a post, for anyone who may see it. A draft's or scheduled post's history is its author's only.
export async function getEditHistory(postId: string): Promise<EditHistoryResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in to see edit history." }
  if (!isId(postId) || !canSeePost(postId, viewer.id)) return { ok: false, error: POST_UNAVAILABLE }
  const versions = editHistoryFor(postId, viewer.id)
  if (versions.length === 0) return { ok: false, error: POST_UNAVAILABLE }
  return { ok: true, versions }
}

export async function publishNow(postId: string): Promise<VoidResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in to publish." }
  const post = isId(postId)
    ? get<{ author_id: string; body: string; reply_to_id: string | null; quote_of_id: string | null; is_draft: number; publish_at: number | null }>(
        "SELECT author_id, body, reply_to_id, quote_of_id, is_draft, publish_at FROM posts WHERE id = ?",
        postId
      )
    : undefined
  if (!post || post.author_id !== viewer.id) return { ok: false, error: "That post was deleted." }
  if (post.is_draft === 0 && post.publish_at === null) return { ok: false, error: "That post is already live." }
  const now = Date.now()
  // A poll runs its full length from the moment the post goes live.
  transaction(() => {
    run("UPDATE posts SET is_draft = 0, publish_at = NULL, created_at = ? WHERE id = ?", now, postId)
    startPollClock(postId, now)
  })
  announcePost({ id: postId, author_id: viewer.id, body: post.body, reply_to_id: post.reply_to_id, quote_of_id: post.quote_of_id })
  refresh()
  return { ok: true }
}

export async function toggleLike(postId: string): Promise<ToggleResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in to like posts." }
  if (!isId(postId) || !canSeeLivePost(postId, viewer.id)) return { ok: false, error: POST_UNAVAILABLE }
  const author = postAuthor(postId)
  if (!author) return { ok: false, error: POST_UNAVAILABLE }

  const existing = get("SELECT 1 AS found FROM likes WHERE user_id = ? AND post_id = ?", viewer.id, postId)
  if (existing) {
    run("DELETE FROM likes WHERE user_id = ? AND post_id = ?", viewer.id, postId)
    run("DELETE FROM notifications WHERE actor_id = ? AND post_id = ? AND kind = 'like'", viewer.id, postId)
    refresh()
    return { ok: true, active: false }
  }
  run("INSERT OR IGNORE INTO likes (user_id, post_id, created_at) VALUES (?, ?, ?)", viewer.id, postId, Date.now())
  notify(author, viewer.id, "like", postId)
  refresh()
  return { ok: true, active: true }
}

export async function toggleRepost(postId: string): Promise<ToggleResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in to repost." }
  if (!isId(postId) || !canSeeLivePost(postId, viewer.id)) return { ok: false, error: POST_UNAVAILABLE }
  const author = postAuthor(postId)
  if (!author) return { ok: false, error: POST_UNAVAILABLE }

  const existing = get("SELECT 1 AS found FROM reposts WHERE user_id = ? AND post_id = ?", viewer.id, postId)
  if (existing) {
    run("DELETE FROM reposts WHERE user_id = ? AND post_id = ?", viewer.id, postId)
    run("DELETE FROM notifications WHERE actor_id = ? AND post_id = ? AND kind = 'repost'", viewer.id, postId)
    refresh()
    return { ok: true, active: false }
  }
  run("INSERT OR IGNORE INTO reposts (user_id, post_id, created_at) VALUES (?, ?, ?)", viewer.id, postId, Date.now())
  notify(author, viewer.id, "repost", postId)
  refresh()
  return { ok: true, active: true }
}

export async function toggleBookmark(postId: string): Promise<ToggleResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in to bookmark posts." }
  if (!isId(postId) || !canSeeLivePost(postId, viewer.id)) return { ok: false, error: POST_UNAVAILABLE }

  const existing = get("SELECT 1 AS found FROM bookmarks WHERE user_id = ? AND post_id = ?", viewer.id, postId)
  if (existing) {
    run("DELETE FROM bookmarks WHERE user_id = ? AND post_id = ?", viewer.id, postId)
    refresh()
    return { ok: true, active: false }
  }
  run("INSERT OR IGNORE INTO bookmarks (user_id, post_id, created_at) VALUES (?, ?, ?)", viewer.id, postId, Date.now())
  refresh()
  return { ok: true, active: true }
}

export async function moveBookmark(postId: string, folderId: string | null): Promise<VoidResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  if (!isId(postId)) return { ok: false, error: "Bookmark this post first." }
  if (folderId !== null) {
    const owned = isId(folderId) && get("SELECT 1 AS found FROM bookmark_folders WHERE id = ? AND user_id = ?", folderId, viewer.id)
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
  if (isId(folderId)) run("DELETE FROM bookmark_folders WHERE id = ? AND user_id = ?", folderId, viewer.id)
  refresh()
  return { ok: true }
}

// Pins one of the author's own live posts to their profile, or unpins with null.
export async function pinPost(postId: string | null): Promise<VoidResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  if (postId !== null) {
    const post = isId(postId)
      ? get<{ author_id: string; reply_to_id: string | null; is_draft: number; publish_at: number | null }>(
          "SELECT author_id, reply_to_id, is_draft, publish_at FROM posts WHERE id = ?",
          postId
        )
      : undefined
    if (!post || post.author_id !== viewer.id) return { ok: false, error: "You can only pin your own posts." }
    if (post.is_draft === 1 || post.publish_at !== null) return { ok: false, error: "Publish this post before pinning it." }
    if (post.reply_to_id) return { ok: false, error: "Replies can't be pinned." }
  }
  run("UPDATE users SET pinned_post_id = ? WHERE id = ?", postId, viewer.id)
  refresh()
  return { ok: true }
}

export async function toggleHighlight(postId: string): Promise<ToggleResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  const author = isId(postId) ? postAuthor(postId) : null
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
  if (!isId(postId) || !canSeeLivePost(postId, viewer.id)) return { ok: false, error: POST_UNAVAILABLE }
  const poll = get<{ ends_at: number }>("SELECT ends_at FROM polls WHERE post_id = ?", postId)
  if (!poll) return { ok: false, error: "That poll was deleted." }
  if (poll.ends_at <= Date.now()) return { ok: false, error: "This poll has ended." }
  const option = isId(optionId) && get("SELECT 1 AS found FROM poll_options WHERE id = ? AND post_id = ?", optionId, postId)
  if (!option) return { ok: false, error: "That choice doesn't exist." }
  const voted = get("SELECT 1 AS found FROM poll_votes WHERE post_id = ? AND user_id = ?", postId, viewer.id)
  if (voted) return { ok: false, error: "You already voted in this poll." }
  run("INSERT OR IGNORE INTO poll_votes (post_id, user_id, option_id, created_at) VALUES (?, ?, ?, ?)", postId, viewer.id, optionId, Date.now())
  refresh()
  return { ok: true }
}

// Counts a view as posts scroll into view: once per person, only for live posts they may see, and never the author's own.
export async function recordViews(postIds: string[]): Promise<void> {
  const viewer = await getViewer()
  if (!viewer || !Array.isArray(postIds)) return
  const ids = [...new Set(postIds.filter(isId))].slice(0, 50)
  const now = Date.now()
  for (const id of visiblePostIds(ids, viewer.id, true)) {
    run(
      "INSERT OR IGNORE INTO post_views (post_id, viewer_id, created_at) SELECT id, ?, ? FROM posts WHERE id = ? AND author_id <> ?",
      viewer.id,
      now,
      id,
      viewer.id
    )
  }
}

export async function reportPost(postId: string, reason: string): Promise<VoidResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in to report posts." }
  if (!isId(postId) || !postAuthor(postId)) return { ok: false, error: "That post was deleted." }
  if (!(REPORT_REASONS as readonly string[]).includes(reason)) return { ok: false, error: "Pick a reason." }
  const reportId = newId()
  run(
    "INSERT INTO reports (id, reporter_id, post_id, user_id, reason, created_at) VALUES (?, ?, ?, NULL, ?, ?)",
    reportId,
    viewer.id,
    postId,
    reason,
    Date.now()
  )
  // A picture of someone shared without their consent comes off the feeds at once, and a person reviews it after.
  if (reason === "Intimate image without consent") {
    hidePost({
      postId,
      category: "intimate_image",
      explanation: "Hidden while we review a report that it was shared without the consent of the person in it.",
      source: `report:${reportId}`,
    })
  }
  return { ok: true }
}

export async function addMutedWord(word: string): Promise<VoidResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  const clean = typeof word === "string" ? word.trim().replace(/^#/, "").toLowerCase() : ""
  if (!clean) return { ok: false, error: "Enter a word or phrase." }
  if (clean.length > MAX_MUTED_WORD) return { ok: false, error: `Muted words can have up to ${MAX_MUTED_WORD} characters.` }
  run("INSERT OR IGNORE INTO muted_words (user_id, word, created_at) VALUES (?, ?, ?)", viewer.id, clean, Date.now())
  refresh()
  return { ok: true }
}

export async function removeMutedWord(word: string): Promise<VoidResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  if (typeof word === "string") run("DELETE FROM muted_words WHERE user_id = ? AND word = ?", viewer.id, word)
  refresh()
  return { ok: true }
}
