"use server"

import { revalidatePath } from "next/cache"
import { getViewer, newId } from "@/lib/auth"
import { canSeeLivePost } from "@/lib/data"
import { get, run } from "@/lib/db"
import { countChars, MAX_NOTE, POST_UNAVAILABLE } from "@/lib/rules"

export type VoidResult = { ok: true } | { ok: false; error: string }
export type NoteResult = { ok: true; id: string } | { ok: false; error: string }

function refresh() {
  revalidatePath("/", "layout")
}

function isId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 100
}

// Anyone who can see a live post can add one community note to it. Readers then rate it.
export async function addNote(postId: string, formData: FormData): Promise<NoteResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in to add a note." }
  if (!isId(postId) || !canSeeLivePost(postId, viewer.id)) return { ok: false, error: POST_UNAVAILABLE }
  const body = String(formData.get("body") ?? "").replace(/\r\n/g, "\n").trim()
  if (!body) return { ok: false, error: "Write the note first." }
  if (countChars(body) > MAX_NOTE) return { ok: false, error: `Notes can have up to ${MAX_NOTE} characters.` }
  if (get("SELECT 1 AS found FROM community_notes WHERE post_id = ? AND author_id = ?", postId, viewer.id)) {
    return { ok: false, error: "You already added a note to this post." }
  }
  const id = newId()
  run("INSERT INTO community_notes (id, post_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)", id, postId, viewer.id, body, Date.now())
  refresh()
  return { ok: true, id }
}

// Tapping the same rating again takes it back. Rating needs the note's post to be visible to the rater.
export async function rateNote(noteId: string, helpful: boolean): Promise<VoidResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in to rate notes." }
  if (typeof helpful !== "boolean") return { ok: false, error: "Pick helpful or not helpful." }
  const note = isId(noteId) ? get<{ author_id: string; post_id: string }>("SELECT author_id, post_id FROM community_notes WHERE id = ?", noteId) : undefined
  if (!note) return { ok: false, error: "That note was deleted." }
  if (!canSeeLivePost(note.post_id, viewer.id)) return { ok: false, error: POST_UNAVAILABLE }
  if (note.author_id === viewer.id) return { ok: false, error: "You can't rate your own note." }
  const current = get<{ helpful: number }>("SELECT helpful FROM community_note_ratings WHERE note_id = ? AND user_id = ?", noteId, viewer.id)
  if (current && (current.helpful === 1) === helpful) {
    run("DELETE FROM community_note_ratings WHERE note_id = ? AND user_id = ?", noteId, viewer.id)
  } else {
    run(
      "INSERT OR REPLACE INTO community_note_ratings (note_id, user_id, helpful, created_at) VALUES (?, ?, ?, ?)",
      noteId,
      viewer.id,
      helpful ? 1 : 0,
      Date.now()
    )
  }
  refresh()
  return { ok: true }
}

export async function deleteNote(noteId: string): Promise<VoidResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  if (isId(noteId)) run("DELETE FROM community_notes WHERE id = ? AND author_id = ?", noteId, viewer.id)
  refresh()
  return { ok: true }
}
