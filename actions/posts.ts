"use server"

import { revalidatePath } from "next/cache"
import { getViewer, newId } from "@/lib/auth"
import { get, run, all } from "@/lib/db"
import { notify } from "@/lib/notify"
import { extractMentions, validatePost } from "@/lib/rules"
import { removeUpload, saveUpload } from "@/lib/uploads"

export type CreateResult = { ok: true; id: string } | { ok: false; error: string }
export type ToggleResult = { ok: true; active: boolean } | { ok: false; error: string }
export type VoidResult = { ok: true } | { ok: false; error: string }

function refresh() {
  revalidatePath("/", "layout")
}

function text(value: FormDataEntryValue | null): string | null {
  return typeof value === "string" && value !== "" ? value : null
}

export async function createPost(formData: FormData): Promise<CreateResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in to post." }

  const body = String(formData.get("body") ?? "").replace(/\r\n/g, "\n").trim()
  const image = formData.get("image")
  const hasImage = image instanceof File && image.size > 0
  const validation = validatePost(body, hasImage)
  if (validation) return { ok: false, error: validation }

  const replyTo = text(formData.get("replyTo"))
  const quoteOf = text(formData.get("quoteOf"))
  const parent = replyTo ? get<{ id: string; author_id: string }>("SELECT id, author_id FROM posts WHERE id = ?", replyTo) : undefined
  if (replyTo && !parent) return { ok: false, error: "That post was deleted." }
  const quoted = quoteOf ? get<{ id: string; author_id: string }>("SELECT id, author_id FROM posts WHERE id = ?", quoteOf) : undefined
  if (quoteOf && !quoted) return { ok: false, error: "That post was deleted." }

  const upload = await saveUpload(image)
  if (upload && !upload.ok) return { ok: false, error: upload.error }

  const id = newId()
  run(
    `INSERT INTO posts (id, author_id, body, reply_to_id, quote_of_id, media_file, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id,
    viewer.id,
    body,
    parent?.id ?? null,
    quoted?.id ?? null,
    upload?.name ?? null,
    Date.now()
  )

  const notified = new Set<string>()
  if (parent && parent.author_id !== viewer.id) {
    notify(parent.author_id, viewer.id, "reply", id)
    notified.add(parent.author_id)
  }
  if (quoted && quoted.author_id !== viewer.id && !notified.has(quoted.author_id)) {
    notify(quoted.author_id, viewer.id, "quote", id)
    notified.add(quoted.author_id)
  }
  for (const handle of extractMentions(body)) {
    const user = get<{ id: string }>("SELECT id FROM users WHERE handle = ? COLLATE NOCASE", handle)
    if (user && user.id !== viewer.id && !notified.has(user.id)) {
      notify(user.id, viewer.id, "mention", id)
      notified.add(user.id)
    }
  }

  refresh()
  return { ok: true, id }
}

function postAuthor(postId: string): string | null {
  return get<{ author_id: string }>("SELECT author_id FROM posts WHERE id = ?", postId)?.author_id ?? null
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

export async function deletePost(postId: string): Promise<VoidResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in to delete posts." }
  const author = postAuthor(postId)
  if (!author) return { ok: false, error: "That post was deleted." }
  if (author !== viewer.id) return { ok: false, error: "You can only delete your own posts." }

  // Collect media for the post and its direct replies, since the cascade removes both.
  const media = all<{ media_file: string | null }>(
    "SELECT media_file FROM posts WHERE id = ? OR reply_to_id = ?",
    postId,
    postId
  )
  run("DELETE FROM posts WHERE id = ? AND author_id = ?", postId, viewer.id)
  for (const row of media) removeUpload(row.media_file)
  refresh()
  return { ok: true }
}
