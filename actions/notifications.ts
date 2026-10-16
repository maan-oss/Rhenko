"use server"

import { revalidatePath } from "next/cache"
import { getAgreedViewer } from "@/lib/auth"
import { run } from "@/lib/db"

export async function markNotificationsRead(): Promise<{ ok: boolean }> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false }
  run("UPDATE notifications SET read = 1 WHERE recipient_id = ? AND read = 0", viewer.id)
  revalidatePath("/", "layout")
  return { ok: true }
}

// When on, mention notifications come only from verified accounts.
export async function setMentionsVerifiedOnly(on: boolean): Promise<{ ok: boolean }> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false }
  run("UPDATE users SET mentions_verified_only = ? WHERE id = ?", on ? 1 : 0, viewer.id)
  revalidatePath("/", "layout")
  return { ok: true }
}
