"use server"

import { revalidatePath } from "next/cache"
import { getViewer } from "@/lib/auth"
import { get, run } from "@/lib/db"
import { MAX_SEARCH_LENGTH, SAVED_SEARCH_LIMIT } from "@/lib/rules"

export async function forgetSearch(query: string): Promise<void> {
  const viewer = await getViewer()
  if (!viewer) return
  run("DELETE FROM recent_searches WHERE user_id = ? AND query = ?", viewer.id, query)
  revalidatePath("/search")
}

export async function clearSearches(): Promise<void> {
  const viewer = await getViewer()
  if (!viewer) return
  run("DELETE FROM recent_searches WHERE user_id = ?", viewer.id)
  revalidatePath("/search")
}

export type SavedSearchResult = { ok: true } | { ok: false; error: string }

// Keeps a search in the account's saved searches, until it is removed. Saving the same words twice does nothing.
export async function saveSearch(query: string): Promise<SavedSearchResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in to save a search." }
  const clean = query.trim().slice(0, MAX_SEARCH_LENGTH)
  if (!clean) return { ok: false, error: "Search for something first." }
  if (get("SELECT 1 AS found FROM saved_searches WHERE user_id = ? AND query = ?", viewer.id, clean)) return { ok: true }
  const count = get<{ n: number }>("SELECT COUNT(*) AS n FROM saved_searches WHERE user_id = ?", viewer.id)?.n ?? 0
  if (count >= SAVED_SEARCH_LIMIT) {
    return { ok: false, error: `You can save up to ${SAVED_SEARCH_LIMIT} searches. Remove one to save this.` }
  }
  run("INSERT INTO saved_searches (user_id, query, created_at) VALUES (?, ?, ?)", viewer.id, clean, Date.now())
  revalidatePath("/search")
  return { ok: true }
}

export async function unsaveSearch(query: string): Promise<void> {
  const viewer = await getViewer()
  if (!viewer) return
  run("DELETE FROM saved_searches WHERE user_id = ? AND query = ?", viewer.id, query)
  revalidatePath("/search")
}
