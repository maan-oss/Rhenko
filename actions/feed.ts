"use server"

import { getAgreedViewer } from "@/lib/auth"
import { get, run, type Param } from "@/lib/db"
import { visiblePostIds } from "@/lib/data"

// How the feed learns how long a post was on screen. The app adds up the time and sends it in small batches. A single
// stretch counts at most a minute, and a post counts at most ten minutes in all, so a tab left open cannot pile up time.
const MAX_BATCH = 50
const MIN_MS = 500
const MAX_STRETCH_MS = 60_000
const MAX_TOTAL_MS = 10 * 60_000

function isId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 100
}

// Adds time on screen to posts the viewer can see and did not write. Posts the viewer wrote are not counted: the feed does not
// rank an author's own posts for them.
export async function recordDwell(entries: { postId: string; ms: number }[]): Promise<void> {
  const viewer = await getAgreedViewer()
  if (!viewer || !Array.isArray(entries)) return
  const totals = new Map<string, number>()
  for (const entry of entries.slice(0, MAX_BATCH)) {
    if (!entry || !isId(entry.postId) || typeof entry.ms !== "number" || !Number.isFinite(entry.ms)) continue
    const ms = Math.min(Math.round(entry.ms), MAX_STRETCH_MS)
    if (ms < MIN_MS) continue
    totals.set(entry.postId, (totals.get(entry.postId) ?? 0) + ms)
  }
  if (totals.size === 0) return
  const visible = await visiblePostIds([...totals.keys()], viewer.id, true)
  const rows = [...totals].filter(([postId]) => visible.has(postId))
  if (rows.length === 0) return
  // One statement for the whole batch, so it costs one round trip rather than one per post.
  const params: Param[] = [viewer.id, Date.now()]
  for (const [postId, ms] of rows) params.push(postId, ms)
  params.push(viewer.id, MAX_TOTAL_MS)
  const pairs = rows.map(() => "(?::text, ?::bigint)").join(", ")
  await run(
    `INSERT INTO post_dwell (viewer_id, post_id, dwell_ms, updated_at)
     SELECT ?, p.id, v.ms, ? FROM (VALUES ${pairs}) AS v(post_id, ms)
     JOIN posts p ON p.id = v.post_id
     WHERE p.author_id <> ?
     ON CONFLICT(viewer_id, post_id) DO UPDATE SET
       dwell_ms = LEAST(post_dwell.dwell_ms + excluded.dwell_ms, ?),
       updated_at = excluded.updated_at`,
    ...params
  )
}

// "Not interested": the post leaves this viewer's For you and stays out. It does not change what anyone else sees.
export async function markNotInterested(postId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in to change what you see." }
  if (!isId(postId)) return { ok: false, error: "That post was deleted." }
  const post = await get<{ author_id: string }>("SELECT author_id FROM posts WHERE id = ?", postId)
  if (!post || post.author_id === viewer.id) return { ok: false, error: "That post was deleted." }
  await run("INSERT INTO feed_hides (viewer_id, post_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING", viewer.id, postId, Date.now())
  return { ok: true }
}
