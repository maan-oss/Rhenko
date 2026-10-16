"use server"

import { getAgreedViewer, newId } from "@/lib/auth"
import { get, run } from "@/lib/db"
import { PROFILE_VISIT_WINDOW_MS } from "@/lib/rules"

// Called when someone opens a profile. The same person counts once per window,
// and the owner's own visits never count.
export async function recordProfileVisit(profileId: string): Promise<void> {
  const viewer = await getAgreedViewer()
  if (!viewer || viewer.id === profileId) return
  if (!get("SELECT 1 AS found FROM users WHERE id = ?", profileId)) return
  const recent = get(
    "SELECT 1 AS found FROM profile_visits WHERE profile_id = ? AND viewer_id = ? AND created_at > ?",
    profileId,
    viewer.id,
    Date.now() - PROFILE_VISIT_WINDOW_MS
  )
  if (recent) return
  run("INSERT INTO profile_visits (id, profile_id, viewer_id, created_at) VALUES (?, ?, ?, ?)", newId(), profileId, viewer.id, Date.now())
}
