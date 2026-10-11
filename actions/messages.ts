"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { getViewer, newId } from "@/lib/auth"
import { db, get, run } from "@/lib/db"
import { MAX_DM, countChars } from "@/lib/rules"

export type MessageState = { ok?: boolean; error?: string }

function cleanHandle(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim().replace(/^@/, "")
}

export async function sendMessage(_prev: MessageState, formData: FormData): Promise<MessageState> {
  const viewer = await getViewer()
  if (!viewer) return { error: "Sign in to send messages." }
  const handle = cleanHandle(formData.get("handle"))
  const body = String(formData.get("body") ?? "").trim()
  if (body.length === 0) return { error: "Write a message first." }
  if (countChars(body) > MAX_DM) return { error: `Messages can have up to ${MAX_DM} characters.` }

  const target = get<{ id: string }>("SELECT id FROM users WHERE handle = ? COLLATE NOCASE", handle)
  if (!target) return { error: "No account with that handle." }
  if (target.id === viewer.id) return { error: "You cannot message yourself." }

  run(
    "INSERT INTO messages (id, sender_id, recipient_id, body, read_at, created_at) VALUES (?, ?, ?, ?, NULL, ?)",
    newId(),
    viewer.id,
    target.id,
    body,
    Date.now()
  )
  revalidatePath("/", "layout")
  return { ok: true }
}

export type OpenState = { error?: string }

export async function openConversation(_prev: OpenState, formData: FormData): Promise<OpenState> {
  const viewer = await getViewer()
  if (!viewer) return { error: "Sign in to send messages." }
  const handle = cleanHandle(formData.get("handle"))
  const target = handle ? get<{ handle: string }>("SELECT handle FROM users WHERE handle = ? COLLATE NOCASE", handle) : undefined
  if (!target) return { error: "No account with that handle." }
  if (target.handle.toLowerCase() === viewer.handle.toLowerCase()) return { error: "You cannot message yourself." }
  redirect(`/messages/${target.handle}`)
}

export async function markThreadRead(handle: string): Promise<{ ok: boolean }> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false }
  const target = get<{ id: string }>("SELECT id FROM users WHERE handle = ? COLLATE NOCASE", handle)
  if (!target) return { ok: false }
  const result = db()
    .prepare("UPDATE messages SET read_at = ? WHERE sender_id = ? AND recipient_id = ? AND read_at IS NULL")
    .run(Date.now(), target.id, viewer.id)
  if (Number(result.changes) > 0) revalidatePath("/", "layout")
  return { ok: true }
}
