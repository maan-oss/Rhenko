"use server"

import { revalidatePath } from "next/cache"
import { getViewer } from "@/lib/auth"
import { run } from "@/lib/db"

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
