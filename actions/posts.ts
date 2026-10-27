"use server"

import { languageOf } from "@/lib/languages"
import { parseStickerSet, stickerSetJson } from "@/lib/stickers"
import { revalidatePath } from "next/cache"
import { getAgreedViewer, newId } from "@/lib/auth"
import { all, change, get, run, transaction } from "@/lib/db"
import { canSeeLivePost, canSeePost, editHistoryFor, visiblePostIds, type EditVersion } from "@/lib/data"
import { memberRole } from "@/lib/circles"
import { notify } from "@/lib/notify"
import { hidePost } from "@/lib/moderation"
import { mediaFilesFor, removeFiles, replyPermission, startPollClock, thread } from "@/lib/post-writes"
import { goLive, screenPost } from "@/lib/screening"
import { consume, waitLabel } from "@/lib/rate-limit"
import { gate, isNewAccount } from "@/lib/risk"
import {
  asReplySetting,
  editWindowMs,
  MAX_ALT,
  MAX_HIGHLIGHTS,
  MAX_IMAGES,
  MAX_MUTED_WORD,
  MAX_FOLDER_NAME,
  MAX_VIDEO_SECONDS,
  MAX_VIDEOS,
  POST_UNAVAILABLE,
  REPORT_REASONS,
  UNDO_WINDOW_MS,
  cleanTitle,
  validatePoll,
  validatePost,
  validateSchedule,
  validateTitle,
  type ReplySetting,
} from "@/lib/rules"
import { parseTrimFields, type Trim } from "@/lib/trim-rules"
import { saveUpload, type MediaKind } from "@/lib/uploads"

export type CreateResult =
  | { ok: true; id: string; status: "published" | "draft" | "scheduled" }
  | { ok: false; error: string; proofRequired?: boolean }
export type ToggleResult = { ok: true; active: boolean } | { ok: false; error: string }
export type VoidResult = { ok: true } | { ok: false; error: string }
export type IdResult = { ok: true; id: string } | { ok: false; error: string }

// Posting limits: posts and drafts per minute, and photos and videos per hour.
const POST_LIMIT = 30
const POST_WINDOW_MS = 60_000
// Likes, reposts, bookmarks and reports per hour. A person does not reach these; a script does. New accounts get less.
const HOUR_MS = 60 * 60_000
const UPLOAD_LIMIT = 60
const UPLOAD_WINDOW_MS = 60 * 60_000
// A trimmed video is decoded and encoded again, which takes a worker for up to a minute or two. A person trims a few an hour.
const TRIM_LIMIT = 10

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
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in to post." }
  const allowed = await consume(`post:${viewer.id}`, POST_LIMIT, POST_WINDOW_MS)
  if (!allowed.ok) return { ok: false, error: `You've posted a lot in the last minute. Try again in ${waitLabel(allowed.retryAfterSeconds)}.` }
  // A post that goes out, or a reply, passes the account check. A draft is seen only by its author, so it does not.
  if (formData.get("draft") !== "on") {
    const verdict = await gate(viewer.id, formData.get("proof"))
    if (!verdict.ok) return { ok: false, error: verdict.error, proofRequired: verdict.proofRequired }
  }

  const body = String(formData.get("body") ?? "").replace(/\r\n/g, "\n").trim()
  // A title makes the post an article.
  const title = cleanTitle(String(formData.get("title") ?? ""))
  // Each file is paired with the alt text sent with it, in the same order, for photos and videos alike.
  const alts = formData.getAll("alt")
  // Stickers come the same way: one entry per picked file, in order. Only a valid set is kept, and only on photos.
  const stickerFields = formData.getAll("stickers")
  // A video can carry the part to keep, as a start and an end in seconds, one entry per picked file. An empty entry keeps all of it.
  const trimStarts = formData.getAll("trimStart")
  const trimEnds = formData.getAll("trimEnd")
  const picked = formData
    .getAll("media")
    .flatMap((value, index) =>
      value instanceof File && value.size > 0
        ? [
            {
              file: value,
              alt: String(alts[index] ?? "").trim().slice(0, MAX_ALT),
              stickers: parseStickerSet(stickerFields[index]),
              trimFields: [trimStarts[index], trimEnds[index]] as const,
            },
          ]
        : []
    )
  const wantsPoll = formData.get("poll") === "on"
  const pollOptions = formData.getAll("pollOption").map((v) => String(v).trim()).filter((v) => v.length > 0)
  const pollMinutes = Number(formData.get("pollMinutes") ?? 0)
  const sensitive = formData.get("sensitive") === "on"
  const madeWithAi = formData.get("madeWithAi") === "on"
  const draft = formData.get("draft") === "on"
  const scheduleRaw = text(formData.get("scheduleAt"))
  const scheduleAt = scheduleRaw && !draft ? Number(scheduleRaw) : null
  const replyTo = text(formData.get("replyTo"))
  const quoteOf = text(formData.get("quoteOf"))
  // The circle a post is written in. The composer sends it for a post made on a circle page or picked in the composer.
  const circleId = text(formData.get("circle"))
  // A thread continues the author's own post: threadOf is the first post of the thread, and replyTo the post before this one.
  const threadOf = text(formData.get("threadOf"))

  const videos = picked.filter((m) => m.file.type.startsWith("video/")).length
  const images = picked.length - videos
  if (videos > MAX_VIDEOS || (videos > 0 && images > 0)) return { ok: false, error: "Add one video, or up to four images." }
  if (images > MAX_IMAGES) return { ok: false, error: `Add up to ${MAX_IMAGES} images.` }
  if (wantsPoll && picked.length > 0) return { ok: false, error: "Polls can't include media." }
  // The trim comes from the browser, so its numbers are checked here. The server checks it again against the file's own length.
  const trims: (Trim | null)[] = []
  for (const item of picked) {
    const parsed = parseTrimFields(item.trimFields[0], item.trimFields[1], MAX_VIDEO_SECONDS)
    if (!parsed.ok) return { ok: false, error: parsed.error }
    if (parsed.trim && !item.file.type.startsWith("video/")) return { ok: false, error: "Only a video can be trimmed." }
    trims.push(parsed.trim)
  }

  const article = title !== ""
  if (article) {
    const titleError = validateTitle(title)
    if (titleError) return { ok: false, error: titleError }
    if (wantsPoll) return { ok: false, error: "Articles can't have polls." }
    if (threadOf !== null) return { ok: false, error: "Articles can't be part of a thread." }
    if (replyTo !== null || quoteOf !== null) return { ok: false, error: "Articles can't be replies or quotes." }
  }
  const validation = validatePost(body, picked.length, wantsPoll, article)
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
  let replyCircle: string | null = null
  if (replyTo !== null) {
    if (draft || scheduleAt !== null) return { ok: false, error: "Replies go out right away, so they can't be saved as drafts or scheduled." }
    const permission = isId(replyTo) ? await replyPermission(viewer.id, replyTo) : { ok: false as const, error: POST_UNAVAILABLE }
    if (!permission.ok) return { ok: false, error: permission.error }
    // A reply takes the reply setting of the post it answers.
    replySetting = permission.setting
    replyCircle = (await get<{ community_id: string | null }>("SELECT community_id FROM posts WHERE id = ?", replyTo))?.community_id ?? null
  }
  if (quoteOf !== null && (!isId(quoteOf) || !await canSeeLivePost(quoteOf, viewer.id))) return { ok: false, error: POST_UNAVAILABLE }

  // A post goes in a circle its author belongs to. A reply stays in the circle of the post it answers, so a conversation
  // in a closed circle stays with its members.
  let community: string | null = null
  if (replyTo !== null) community = replyCircle
  else if (circleId !== null) {
    if (!isId(circleId) || await memberRole(circleId, viewer.id) === null) {
      return { ok: false, error: "You can only post in circles you belong to." }
    }
    community = circleId
  }

  // A thread continuation must answer the viewer's own post, and that post must be the thread's first post or part of it.
  let threadId: string | null = null
  if (threadOf !== null) {
    const first = isId(threadOf)
      ? await get<{ author_id: string; reply_to_id: string | null; thread_id: string | null }>(
          "SELECT author_id, reply_to_id, thread_id FROM posts WHERE id = ? AND is_draft = 0 AND publish_at IS NULL AND removed_at IS NULL",
          threadOf
        )
      : undefined
    const before = replyTo !== null && isId(replyTo)
      ? await get<{ author_id: string; thread_id: string | null }>("SELECT author_id, thread_id FROM posts WHERE id = ?", replyTo)
      : undefined
    const inThread = before !== undefined && (replyTo === threadOf || before.thread_id === threadOf)
    if (!first || first.author_id !== viewer.id || first.reply_to_id !== null || first.thread_id !== null || !inThread || before?.author_id !== viewer.id) {
      return { ok: false, error: POST_UNAVAILABLE }
    }
    threadId = threadOf
  }

  for (let i = 0; i < picked.length; i++) {
    const room = await consume(`upload:${viewer.id}`, UPLOAD_LIMIT, UPLOAD_WINDOW_MS)
    if (!room.ok) {
      return { ok: false, error: `You've added a lot of photos and videos in the last hour. Try again in ${waitLabel(room.retryAfterSeconds)}.` }
    }
  }

  for (const trim of trims) {
    if (!trim) continue
    const room = await consume(`trim:${viewer.id}`, TRIM_LIMIT, UPLOAD_WINDOW_MS)
    if (!room.ok) return { ok: false, error: `You've trimmed a lot of videos in the last hour. Try again in ${waitLabel(room.retryAfterSeconds)}.` }
  }

  // From here on, every way out without a post removes the files saved for it.
  const saved: { file: string; kind: MediaKind; alt: string; stickers: string | null }[] = []
  const discard = async () => await removeFiles(saved.map((s) => s.file))
  try {
    for (const [index, item] of picked.entries()) {
      const upload = await saveUpload(item.file, "any", trims[index])
      if (!upload) continue
      if (!upload.ok) {
        await discard()
        return { ok: false, error: upload.error }
      }
      const stickers = upload.kind === "image" && item.stickers ? stickerSetJson(item.stickers) : null
      saved.push({ file: upload.name, kind: upload.kind, alt: item.alt, stickers })
    }
  } catch (error) {
    await discard()
    console.error("[posts] saving media failed", error)
    return { ok: false, error: "Your photos or video couldn't be saved. Try again." }
  }

  const now = Date.now()
  const id = newId()
  const status = draft ? "draft" : scheduleAt !== null ? "scheduled" : "published"
  const publishAt = status === "scheduled" ? scheduleAt : null
  try {
    await transaction(async () => {
      await run(
        `INSERT INTO posts (id, author_id, body, reply_to_id, quote_of_id, media_file, created_at, reply_setting, sensitive, publish_at, is_draft, thread_id, lang, community_id, title, made_with_ai)
         VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        viewer.id,
        body,
        replyTo,
        quoteOf,
        now,
        replySetting,
        sensitive ? 1 : 0,
        publishAt,
        draft ? 1 : 0,
        threadId,
        languageOf(body),
        community,
        title,
        madeWithAi ? 1 : 0
      )
      for (const [position, media] of saved.entries()) {
        await run(
          "INSERT INTO post_media (id, post_id, file, kind, alt, position, stickers) VALUES (?, ?, ?, ?, ?, ?, ?)",
          newId(),
          id,
          media.file,
          media.kind,
          media.alt,
          position,
          media.stickers
        )
      }
      if (wantsPoll) {
        // The length is kept, so a draft's poll can start its clock when the draft is published.
        const durationMs = pollMinutes * 60 * 1000
        await run("INSERT INTO polls (post_id, ends_at, duration_ms) VALUES (?, ?, ?)", id, (publishAt ?? now) + durationMs, durationMs)
        for (const [position, label] of pollOptions.entries()) {
          await run("INSERT INTO poll_options (id, post_id, position, label) VALUES (?, ?, ?, ?)", newId(), id, position, label)
        }
      }
    })
  } catch (error) {
    await discard()
    console.error("[posts] saving the post failed", error)
    return { ok: false, error: "Your post couldn't be saved. Try again." }
  }

  if (status === "published") await goLive(id)
  refresh()
  return { ok: true, id, status }
}

// Editing is allowed for a short window after a post goes live.
export async function editPost(postId: string, formData: FormData): Promise<VoidResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in to edit posts." }
  if (!isId(postId)) return { ok: false, error: "That post was deleted." }
  const post = await get<{
    author_id: string
    created_at: number
    is_draft: number
    publish_at: number | null
    body: string
    title: string
    edited_at: number | null
    removed_at: number | null
    reply_to_id: string | null
  }>("SELECT author_id, created_at, is_draft, publish_at, body, title, edited_at, removed_at, reply_to_id FROM posts WHERE id = ?", postId)
  if (!post) return { ok: false, error: "That post was deleted." }
  if (post.removed_at !== null) return { ok: false, error: POST_UNAVAILABLE }
  if (post.author_id !== viewer.id) return { ok: false, error: "You can only edit your own posts." }
  if (post.is_draft === 1 || post.publish_at !== null) return { ok: false, error: "Publish this post before editing it." }
  const reply = post.reply_to_id !== null
  const window = editWindowMs(viewer.plus, reply)
  if (Date.now() - post.created_at > window) {
    const minutes = Math.round(window / 60_000)
    return { ok: false, error: reply ? `Replies can be edited for ${minutes} minutes after they're posted.` : `Posts can be edited for ${minutes} minutes after they're posted.` }
  }

  const body = String(formData.get("body") ?? "").replace(/\r\n/g, "\n").trim()
  // An article keeps its title, which can be changed along with its text.
  const article = post.title !== ""
  const title = article ? cleanTitle(String(formData.get("title") ?? "")) : ""
  if (article) {
    if (title === "") return { ok: false, error: "Give the article a title." }
    const titleError = validateTitle(title)
    if (titleError) return { ok: false, error: titleError }
  }
  const media = await all<{ id: string }>("SELECT id FROM post_media WHERE post_id = ?", postId)
  const hasPoll = await get("SELECT 1 AS found FROM polls WHERE post_id = ?", postId) !== undefined
  const validation = validatePost(body, media.length, hasPoll, article)
  if (validation) return { ok: false, error: validation }

  await transaction(async () => {
    // Only a changed text counts as an edit: it is marked as edited and the text being replaced is kept, dated to
    // when it was written, for the edit history. Changing only the alt text leaves the post as it was.
    const changed = body !== post.body
    const retitled = article && title !== post.title
    if (changed) {
      await run(
        "INSERT INTO post_edits (id, post_id, body, created_at) VALUES (?, ?, ?, ?)",
        newId(),
        postId,
        post.body,
        post.edited_at ?? post.created_at
      )
    }
    if (retitled) await run("UPDATE posts SET title = ? WHERE id = ?", title, postId)
    await run("UPDATE posts SET body = ?, edited_at = ? WHERE id = ?", body, changed || retitled ? Date.now() : post.edited_at, postId)
    if (changed) {
      // The language is found again for the new text, and a translation of the old text no longer applies.
      await run("UPDATE posts SET lang = ? WHERE id = ?", languageOf(body), postId)
      await run("DELETE FROM post_translations WHERE post_id = ?", postId)
    }
    for (const item of media) {
      const raw = formData.get(`alt-${item.id}`)
      if (typeof raw === "string") {
        await run("UPDATE post_media SET alt = ? WHERE id = ?", raw.trim().slice(0, MAX_ALT), item.id)
      }
    }
  })
  // The new text is checked again, so an edit cannot turn a cleared post into spam. The check keeps its own transaction,
  // so it runs once the save above is done.
  if (body !== post.body || (article && title !== post.title)) await screenPost(postId)
  refresh()
  return { ok: true }
}

async function postAuthor(postId: string): Promise<string | null> {
  return (await get<{ author_id: string }>("SELECT author_id FROM posts WHERE id = ?", postId))?.author_id ?? null
}

export async function deletePost(postId: string): Promise<VoidResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in to delete posts." }
  const author = isId(postId) ? await postAuthor(postId) : null
  if (!author) return { ok: false, error: "That post was deleted." }
  if (author !== viewer.id) return { ok: false, error: "You can only delete your own posts." }

  // Replies go with their parent, so their media is removed too.
  const files = await mediaFilesFor(await thread(postId))
  await run("DELETE FROM posts WHERE id = ? AND author_id = ?", postId, viewer.id)
  await removeFiles(files)
  refresh()
  return { ok: true }
}

// Takes back a post moments after it went out, while the undo window is open.
export async function undoPost(postId: string): Promise<VoidResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  const post = isId(postId) ? await get<{ author_id: string; created_at: number }>("SELECT author_id, created_at FROM posts WHERE id = ?", postId) : undefined
  if (!post || post.author_id !== viewer.id) return { ok: false, error: "That post was deleted." }
  if (Date.now() - post.created_at > UNDO_WINDOW_MS) return { ok: false, error: "The undo window has closed." }
  const files = await mediaFilesFor(await thread(postId))
  await run("DELETE FROM posts WHERE id = ? AND author_id = ?", postId, viewer.id)
  await removeFiles(files)
  refresh()
  return { ok: true }
}

// The author of a post can hide replies to it. Hidden replies stay visible to the
// person who wrote them and to the post's author, and are hidden from everyone else.
export async function setReplyHidden(replyId: string, hidden: boolean): Promise<VoidResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  const reply = isId(replyId) ? await get<{ reply_to_id: string | null }>("SELECT reply_to_id FROM posts WHERE id = ?", replyId) : undefined
  if (!reply?.reply_to_id) return { ok: false, error: "That reply was deleted." }
  const parentAuthor = await postAuthor(reply.reply_to_id)
  if (parentAuthor !== viewer.id) return { ok: false, error: "Only the author of the post can hide its replies." }
  await run("UPDATE posts SET hidden_by_parent = ? WHERE id = ?", hidden === true ? 1 : 0, replyId)
  refresh()
  return { ok: true }
}

export type EditHistoryResult = { ok: true; versions: EditVersion[] } | { ok: false; error: string }

// Earlier versions of a post, for anyone who may see it. A draft's or scheduled post's history is its author's only.
export async function getEditHistory(postId: string): Promise<EditHistoryResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in to see edit history." }
  if (!isId(postId) || !await canSeePost(postId, viewer.id)) return { ok: false, error: POST_UNAVAILABLE }
  const versions = await editHistoryFor(postId, viewer.id)
  if (versions.length === 0) return { ok: false, error: POST_UNAVAILABLE }
  return { ok: true, versions }
}

export async function publishNow(postId: string, proof?: string): Promise<VoidResult & { proofRequired?: boolean }> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in to publish." }
  const post = isId(postId)
    ? await get<{ author_id: string; body: string; reply_to_id: string | null; quote_of_id: string | null; is_draft: number; publish_at: number | null }>(
        "SELECT author_id, body, reply_to_id, quote_of_id, is_draft, publish_at FROM posts WHERE id = ?",
        postId
      )
    : undefined
  if (!post || post.author_id !== viewer.id) return { ok: false, error: "That post was deleted." }
  if (post.is_draft === 0 && post.publish_at === null) return { ok: false, error: "That post is already live." }
  // A draft skipped the account check when it was saved, because only its author sees it. It passes the check now, as any
  // post that goes out does, so a limited account cannot post by saving drafts and publishing them. A scheduled post
  // passed it when it was scheduled.
  if (post.is_draft === 1) {
    const verdict = await gate(viewer.id, proof)
    if (!verdict.ok) return { ok: false, error: verdict.error, proofRequired: verdict.proofRequired }
  }
  const now = Date.now()
  // A poll runs its full length from the moment the post goes live. The update only takes a post that is still waiting, so
  // a second tap, or a scheduled post that went live a moment ago, is not announced twice.
  const claimed = await transaction(async () => {
    const taken = await change(
      "UPDATE posts SET is_draft = 0, publish_at = NULL, created_at = ? WHERE id = ? AND author_id = ? AND (is_draft = 1 OR publish_at IS NOT NULL)",
      now,
      postId,
      viewer.id
    )
    if (taken === 0) return false
    await startPollClock(postId, now)
    return true
  })
  if (!claimed) return { ok: false, error: "That post is already live." }
  await goLive(postId, now)
  refresh()
  return { ok: true }
}

export async function toggleLike(postId: string): Promise<ToggleResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in to like posts." }
  if (!isId(postId) || !await canSeeLivePost(postId, viewer.id)) return { ok: false, error: POST_UNAVAILABLE }
  const author = await postAuthor(postId)
  if (!author) return { ok: false, error: POST_UNAVAILABLE }

  const existing = await get("SELECT 1 AS found FROM likes WHERE user_id = ? AND post_id = ?", viewer.id, postId)
  if (existing) {
    await run("DELETE FROM likes WHERE user_id = ? AND post_id = ?", viewer.id, postId)
    await run("DELETE FROM notifications WHERE actor_id = ? AND post_id = ? AND kind = 'like'", viewer.id, postId)
    return { ok: true, active: false }
  }
  const likes = await consume(`like:${viewer.id}`, await isNewAccount(viewer.id) ? 60 : 240, HOUR_MS)
  if (!likes.ok) return { ok: false, error: `You're liking posts too fast. Try again in ${waitLabel(likes.retryAfterSeconds)}.` }
  // Only the request that added the like notifies. A like sent twice at once, from two tabs say, adds one row and one notice.
  const added = await change("INSERT INTO likes (user_id, post_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING", viewer.id, postId, Date.now())
  if (added > 0) await notify(author, viewer.id, "like", postId)
  return { ok: true, active: true }
}

export async function toggleRepost(postId: string): Promise<ToggleResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in to repost." }
  if (!isId(postId) || !await canSeeLivePost(postId, viewer.id)) return { ok: false, error: POST_UNAVAILABLE }
  const author = await postAuthor(postId)
  if (!author) return { ok: false, error: POST_UNAVAILABLE }

  const existing = await get("SELECT 1 AS found FROM reposts WHERE user_id = ? AND post_id = ?", viewer.id, postId)
  if (existing) {
    await run("DELETE FROM reposts WHERE user_id = ? AND post_id = ?", viewer.id, postId)
    await run("DELETE FROM notifications WHERE actor_id = ? AND post_id = ? AND kind = 'repost'", viewer.id, postId)
    return { ok: true, active: false }
  }
  const reposts = await consume(`repost:${viewer.id}`, await isNewAccount(viewer.id) ? 30 : 120, HOUR_MS)
  if (!reposts.ok) return { ok: false, error: `You're reposting too fast. Try again in ${waitLabel(reposts.retryAfterSeconds)}.` }
  const added = await change("INSERT INTO reposts (user_id, post_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING", viewer.id, postId, Date.now())
  if (added > 0) await notify(author, viewer.id, "repost", postId)
  return { ok: true, active: true }
}

export async function toggleBookmark(postId: string): Promise<ToggleResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in to bookmark posts." }
  if (!isId(postId) || !await canSeeLivePost(postId, viewer.id)) return { ok: false, error: POST_UNAVAILABLE }

  const existing = await get("SELECT 1 AS found FROM bookmarks WHERE user_id = ? AND post_id = ?", viewer.id, postId)
  if (existing) {
    await run("DELETE FROM bookmarks WHERE user_id = ? AND post_id = ?", viewer.id, postId)
    return { ok: true, active: false }
  }
  const marks = await consume(`bookmark:${viewer.id}`, await isNewAccount(viewer.id) ? 60 : 300, HOUR_MS)
  if (!marks.ok) return { ok: false, error: `You're bookmarking posts too fast. Try again in ${waitLabel(marks.retryAfterSeconds)}.` }
  await run("INSERT INTO bookmarks (user_id, post_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING", viewer.id, postId, Date.now())
  return { ok: true, active: true }
}

export async function moveBookmark(postId: string, folderId: string | null): Promise<VoidResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  if (!isId(postId)) return { ok: false, error: "Bookmark this post first." }
  if (folderId !== null) {
    const owned = isId(folderId) && await get("SELECT 1 AS found FROM bookmark_folders WHERE id = ? AND user_id = ?", folderId, viewer.id)
    if (!owned) return { ok: false, error: "That folder doesn't exist." }
  }
  const updated = await get<{ c: number }>("SELECT COUNT(*) AS c FROM bookmarks WHERE user_id = ? AND post_id = ?", viewer.id, postId)
  if (!updated || updated.c === 0) return { ok: false, error: "Bookmark this post first." }
  await run("UPDATE bookmarks SET folder_id = ? WHERE user_id = ? AND post_id = ?", folderId, viewer.id, postId)
  refresh()
  return { ok: true }
}

export async function createFolder(formData: FormData): Promise<IdResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  const name = String(formData.get("name") ?? "").trim()
  if (!name) return { ok: false, error: "Name the folder." }
  if (name.length > MAX_FOLDER_NAME) return { ok: false, error: `Folder names can have up to ${MAX_FOLDER_NAME} characters.` }
  const id = newId()
  await run("INSERT INTO bookmark_folders (id, user_id, name, created_at) VALUES (?, ?, ?, ?)", id, viewer.id, name, Date.now())
  refresh()
  return { ok: true, id }
}

export async function deleteFolder(folderId: string): Promise<VoidResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  if (isId(folderId)) await run("DELETE FROM bookmark_folders WHERE id = ? AND user_id = ?", folderId, viewer.id)
  refresh()
  return { ok: true }
}

// Pins one of the author's own live posts to their profile, or unpins with null.
export async function pinPost(postId: string | null): Promise<VoidResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  if (postId !== null) {
    const post = isId(postId)
      ? await get<{ author_id: string; reply_to_id: string | null; is_draft: number; publish_at: number | null }>(
          "SELECT author_id, reply_to_id, is_draft, publish_at FROM posts WHERE id = ?",
          postId
        )
      : undefined
    if (!post || post.author_id !== viewer.id) return { ok: false, error: "You can only pin your own posts." }
    if (post.is_draft === 1 || post.publish_at !== null) return { ok: false, error: "Publish this post before pinning it." }
    if (post.reply_to_id) return { ok: false, error: "Replies can't be pinned." }
  }
  await run("UPDATE users SET pinned_post_id = ? WHERE id = ?", postId, viewer.id)
  refresh()
  return { ok: true }
}

export async function toggleHighlight(postId: string): Promise<ToggleResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  const author = isId(postId) ? await postAuthor(postId) : null
  if (!author) return { ok: false, error: "That post was deleted." }
  if (author !== viewer.id) return { ok: false, error: "You can only highlight your own posts." }
  const existing = await get("SELECT 1 AS found FROM highlights WHERE user_id = ? AND post_id = ?", viewer.id, postId)
  if (existing) {
    await run("DELETE FROM highlights WHERE user_id = ? AND post_id = ?", viewer.id, postId)
    refresh()
    return { ok: true, active: false }
  }
  const count = (await get<{ c: number }>("SELECT COUNT(*) AS c FROM highlights WHERE user_id = ?", viewer.id))?.c ?? 0
  if (count >= MAX_HIGHLIGHTS) return { ok: false, error: `You can highlight up to ${MAX_HIGHLIGHTS} posts.` }
  await run("INSERT INTO highlights (user_id, post_id, created_at) VALUES (?, ?, ?)", viewer.id, postId, Date.now())
  refresh()
  return { ok: true, active: true }
}

export async function votePoll(postId: string, optionId: string): Promise<VoidResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in to vote." }
  if (!isId(postId) || !await canSeeLivePost(postId, viewer.id)) return { ok: false, error: POST_UNAVAILABLE }
  const poll = await get<{ ends_at: number }>("SELECT ends_at FROM polls WHERE post_id = ?", postId)
  if (!poll) return { ok: false, error: "That poll was deleted." }
  if (poll.ends_at <= Date.now()) return { ok: false, error: "This poll has ended." }
  const option = isId(optionId) && await get("SELECT 1 AS found FROM poll_options WHERE id = ? AND post_id = ?", optionId, postId)
  if (!option) return { ok: false, error: "That choice doesn't exist." }
  const voted = await get("SELECT 1 AS found FROM poll_votes WHERE post_id = ? AND user_id = ?", postId, viewer.id)
  if (voted) return { ok: false, error: "You already voted in this poll." }
  await run("INSERT INTO poll_votes (post_id, user_id, option_id, created_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING", postId, viewer.id, optionId, Date.now())
  refresh()
  return { ok: true }
}

// Counts a view as posts scroll into view: once per person, only for live posts they may see, and never the author's own.
export async function recordViews(postIds: string[]): Promise<void> {
  const viewer = await getAgreedViewer()
  if (!viewer || !Array.isArray(postIds)) return
  const ids = [...new Set(postIds.filter(isId))].slice(0, 50)
  const now = Date.now()
  for (const id of await visiblePostIds(ids, viewer.id, true)) {
    await run(
      "INSERT INTO post_views (post_id, viewer_id, created_at) SELECT id, ?, ? FROM posts WHERE id = ? AND author_id <> ? ON CONFLICT DO NOTHING",
      viewer.id,
      now,
      id,
      viewer.id
    )
  }
}

export async function reportPost(postId: string, reason: string): Promise<VoidResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in to report posts." }
  if (!isId(postId) || !await postAuthor(postId)) return { ok: false, error: "That post was deleted." }
  if (!(REPORT_REASONS as readonly string[]).includes(reason)) return { ok: false, error: "Pick a reason." }
  // Reports are how posts get taken down, so each account can send only so many an hour.
  const reportLimit = await consume(`report:${viewer.id}`, await isNewAccount(viewer.id) ? 5 : 20, HOUR_MS)
  if (!reportLimit.ok) return { ok: false, error: `You've sent a lot of reports. Try again in ${waitLabel(reportLimit.retryAfterSeconds)}.` }
  const reportId = newId()
  await run(
    "INSERT INTO reports (id, reporter_id, post_id, user_id, reason, created_at) VALUES (?, ?, ?, NULL, ?, ?)",
    reportId,
    viewer.id,
    postId,
    reason,
    Date.now()
  )
  // A picture of someone shared without their consent comes off the feeds at once, and a person reviews it after.
  if (reason === "Intimate image without consent") {
    await hidePost({
      postId,
      category: "intimate_image",
      explanation: "Hidden while we review a report that it was shared without the consent of the person in it.",
      source: `report:${reportId}`,
    })
  }
  return { ok: true }
}

export async function addMutedWord(word: string): Promise<VoidResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  const clean = typeof word === "string" ? word.trim().replace(/^#/, "").toLowerCase() : ""
  if (!clean) return { ok: false, error: "Enter a word or phrase." }
  if (clean.length > MAX_MUTED_WORD) return { ok: false, error: `Muted words can have up to ${MAX_MUTED_WORD} characters.` }
  await run("INSERT INTO muted_words (user_id, word, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING", viewer.id, clean, Date.now())
  refresh()
  return { ok: true }
}

export async function removeMutedWord(word: string): Promise<VoidResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  if (typeof word === "string") await run("DELETE FROM muted_words WHERE user_id = ? AND word = ?", viewer.id, word)
  refresh()
  return { ok: true }
}
