import { run } from "@/lib/db"
import { MAX_SEARCH_LENGTH, RECENT_SEARCH_LIMIT } from "@/lib/rules"

// Keeps a search in the account's recent searches, newest first, up to the limit. It runs while the results page is
// rendered on the server, so the search is saved whether or not the browser has finished loading the page.
export async function recordSearch(viewerId: string, query: string): Promise<void> {
  const clean = query.trim().slice(0, MAX_SEARCH_LENGTH)
  if (!clean) return
  await run(
    `INSERT INTO recent_searches (user_id, query, created_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id, query) DO UPDATE SET created_at = excluded.created_at`,
    viewerId,
    clean,
    Date.now()
  )
  await run(
    `DELETE FROM recent_searches WHERE user_id = ? AND query NOT IN (
       SELECT query FROM recent_searches WHERE user_id = ? ORDER BY created_at DESC LIMIT ?
     )`,
    viewerId,
    viewerId,
    RECENT_SEARCH_LIMIT
  )
}
