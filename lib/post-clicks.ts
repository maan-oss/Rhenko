import { all, get, run } from "@/lib/db"
import { consume } from "@/lib/rate-limit"

// What someone clicked on a post. "detail" is the post opening from its card (its time or its body), "photo" is a photo
// opened in the lightbox, and "hashtag" covers hashtags and cashtags.
export const CLICK_KINDS = ["link", "profile", "detail", "photo", "hashtag"] as const
export type ClickKind = (typeof CLICK_KINDS)[number]
export type ClickCounts = Record<ClickKind, number>

const MINUTE_MS = 60_000
// A person can click many things in a minute, but not thousands. The limit keeps a script from inflating the numbers.
const CLICKS_PER_MINUTE = 240

export function isClickKind(value: unknown): value is ClickKind {
  return typeof value === "string" && (CLICK_KINDS as readonly string[]).includes(value)
}

export function emptyClickCounts(): ClickCounts {
  return { link: 0, profile: 0, detail: 0, photo: 0, hashtag: 0 }
}

export function totalClicks(counts: ClickCounts): number {
  return CLICK_KINDS.reduce((sum, kind) => sum + counts[kind], 0)
}

// Counts one click on a post. Clicks on one's own posts are not counted, and nothing records who clicked.
// The caller checks that the post is visible to the viewer. Returns false when the click was not counted.
export async function recordPostClick(viewerId: string, postId: string, kind: ClickKind, now = Date.now()): Promise<boolean> {
  if (!(await consume(`post-click:${viewerId}`, CLICKS_PER_MINUTE, MINUTE_MS, now)).ok) return false
  const post = await get<{ author_id: string }>(
    "SELECT author_id FROM posts WHERE id = ? AND is_draft = 0 AND publish_at IS NULL AND removed_at IS NULL",
    postId
  )
  if (!post || post.author_id === viewerId) return false
  await run("INSERT INTO post_clicks (post_id, kind, created_at) VALUES (?, ?, ?)", postId, kind, now)
  return true
}

// Clicks by kind for one post. Used by the post's own analytics page.
export async function clickCountsFor(postId: string): Promise<ClickCounts> {
  const counts = emptyClickCounts()
  for (const row of await all<{ kind: string; c: number }>("SELECT kind, COUNT(*) AS c FROM post_clicks WHERE post_id = ? GROUP BY kind", postId)) {
    if (isClickKind(row.kind)) counts[row.kind] = row.c
  }
  return counts
}

// Clicks by kind for every post of one author, in one query. Used by the posts table and its CSV file.
export async function clickCountsByPost(authorId: string): Promise<Map<string, ClickCounts>> {
  const byPost = new Map<string, ClickCounts>()
  for (const row of await all<{ post_id: string; kind: string; c: number }>(
    `SELECT c.post_id, c.kind, COUNT(*) AS c FROM post_clicks c
     JOIN posts p ON p.id = c.post_id
     WHERE p.author_id = ?
     GROUP BY c.post_id, c.kind`,
    authorId
  )) {
    if (!isClickKind(row.kind)) continue
    const counts = byPost.get(row.post_id) ?? emptyClickCounts()
    counts[row.kind] = row.c
    byPost.set(row.post_id, counts)
  }
  return byPost
}
