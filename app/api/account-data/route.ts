import { getViewer } from "@/lib/auth"
import { all, get } from "@/lib/db"

// A JSON copy of the signed-in person's own account data. Messages are left out.
export async function GET() {
  const viewer = await getViewer()
  if (!viewer) return Response.json({ error: "Sign in first." }, { status: 401 })

  const profile = get<Record<string, unknown>>(
    `SELECT handle, name, bio, location, website, birthday, protected, created_at FROM users WHERE id = ?`,
    viewer.id
  )
  const posts = all<Record<string, unknown>>(
    `SELECT id, body, reply_to_id, quote_of_id, community_id, sensitive, created_at, edited_at, is_draft, publish_at
     FROM posts WHERE author_id = ? ORDER BY created_at DESC`,
    viewer.id
  )
  const follows = all<{ handle: string; created_at: number }>(
    `SELECT u.handle, f.created_at FROM follows f JOIN users u ON u.id = f.followee_id WHERE f.follower_id = ? ORDER BY f.created_at DESC`,
    viewer.id
  )
  const followers = all<{ handle: string; created_at: number }>(
    `SELECT u.handle, f.created_at FROM follows f JOIN users u ON u.id = f.follower_id WHERE f.followee_id = ? ORDER BY f.created_at DESC`,
    viewer.id
  )
  const bookmarks = all<{ post_id: string; created_at: number }>(
    "SELECT post_id, created_at FROM bookmarks WHERE user_id = ? ORDER BY created_at DESC",
    viewer.id
  )
  const lists = all<{ id: string; name: string; description: string; private: number; created_at: number }>(
    "SELECT id, name, description, private, created_at FROM lists WHERE owner_id = ? ORDER BY created_at DESC",
    viewer.id
  )
  const listMembers = all<{ list_id: string; handle: string }>(
    "SELECT m.list_id, u.handle FROM list_members m JOIN lists l ON l.id = m.list_id JOIN users u ON u.id = m.user_id WHERE l.owner_id = ?",
    viewer.id
  )
  const blocks = all<{ handle: string }>("SELECT u.handle FROM blocks b JOIN users u ON u.id = b.blocked_id WHERE b.blocker_id = ?", viewer.id)
  const mutes = all<{ handle: string }>("SELECT u.handle FROM mutes m JOIN users u ON u.id = m.muted_id WHERE m.muter_id = ?", viewer.id)
  const mutedWords = all<{ word: string }>("SELECT word FROM muted_words WHERE user_id = ?", viewer.id)

  const body = {
    exportedAt: new Date().toISOString(),
    profile,
    posts,
    following: follows,
    followers,
    bookmarks,
    lists: lists.map((list) => ({ ...list, members: listMembers.filter((m) => m.list_id === list.id).map((m) => m.handle) })),
    blocked: blocks.map((b) => b.handle),
    muted: mutes.map((m) => m.handle),
    mutedWords: mutedWords.map((w) => w.word),
  }

  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="rhenko-${viewer.handle}-data.json"`,
      "Cache-Control": "no-store",
    },
  })
}
