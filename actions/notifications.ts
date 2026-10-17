"use server"

import { revalidatePath } from "next/cache"
import { getAgreedViewer } from "@/lib/auth"
import { run } from "@/lib/db"
import { isFollowing } from "@/lib/post-writes"
import {
  isPriorityAccount,
  MAX_PRIORITY_ACCOUNTS,
  priorityAccountCount,
  setPriorityAccount as storePriorityAccount,
} from "@/lib/priority-accounts"

export async function markNotificationsRead(): Promise<{ ok: boolean }> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false }
  await run("UPDATE notifications SET read = 1 WHERE recipient_id = ? AND read = 0", viewer.id)
  revalidatePath("/", "layout")
  return { ok: true }
}

// When on, mention notifications come only from verified accounts.
export async function setMentionsVerifiedOnly(on: boolean): Promise<{ ok: boolean }> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false }
  await run("UPDATE users SET mentions_verified_only = ? WHERE id = ?", on ? 1 : 0, viewer.id)
  revalidatePath("/", "layout")
  return { ok: true }
}

// Puts a followed account in the Priority tab, or takes it out. Only accounts the viewer follows can be added.
export async function setPriorityAccount(accountId: string, on: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in to change priority accounts." }
  if (typeof accountId !== "string" || accountId.length === 0 || accountId.length > 64) {
    return { ok: false, error: "That account can't be found. Reload the page and try again." }
  }
  if (on) {
    if (!await isFollowing(viewer.id, accountId)) return { ok: false, error: "Follow an account before you add it to Priority." }
    if (!await isPriorityAccount(viewer.id, accountId) && await priorityAccountCount(viewer.id) >= MAX_PRIORITY_ACCOUNTS) {
      return { ok: false, error: `Priority holds up to ${MAX_PRIORITY_ACCOUNTS} accounts. Remove one to add another.` }
    }
  }
  await storePriorityAccount(viewer.id, accountId, on, Date.now())
  return { ok: true }
}
