"use server"

import { revalidatePath } from "next/cache"
import { getViewer } from "@/lib/auth"
import { run } from "@/lib/db"
import { MAX_SEARCH_LENGTH, RECENT_SEARCH_LIMIT } from "@/lib/rules"

// Recent searches are kept per account, newest first, up to the limit.
export async function rememberSearch(query: string): Promise<void> {
  const viewer = await getViewer()
  if (!viewer) return
  const clean = query.trim().slice(0, MAX_SEARCH_LENGTH)
  if (!clean) return
  run(
    `INSERT INTO recent_searches (user_id, query, created_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id, query) DO UPDATE SET created_at = excluded.created_at`,
    viewer.id,
    clean,
    Date.now()
  )
  run(
    `DELETE FROM recent_searches WHERE user_id = ? AND query NOT IN (
       SELECT query FROM recent_searches WHERE user_id = ? ORDER BY created_at DESC LIMIT ?
     )`,
    viewer.id,
    viewer.id,
    RECENT_SEARCH_LIMIT
  )
}

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
