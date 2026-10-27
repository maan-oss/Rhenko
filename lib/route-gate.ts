import { openCircle, openList } from "@/lib/access"
import { get } from "@/lib/db"
import { canSeePost, conversationFor } from "@/lib/data"
import { groupForInvite } from "@/lib/group-invites"
import { HANDLE_PATTERN, RESERVED_HANDLES } from "@/lib/rules"
import { topicFromParam } from "@/lib/social-rules"
import { hashToken } from "@/lib/session-hash"

// A page under the app's loading boundary cannot answer "not here" with a 404. The boundary streams a 200 before the page's
// existence check runs, so the screen says the record is missing but the status says it was found. The proxy therefore runs
// the same first check before anything streams. A refused record is sent to a path no page claims, and the server answers
// that with a real 404. Each check below is the page's own first check, reached through the same function, so the two agree.

// Two segments, so the profile route (one segment) cannot claim it, and no page takes a second segment named not-found.
export const MISSING_PAGE = "/_missing/not-found"

// The sections of a profile that the profile's own pages check the same way the profile itself is checked.
const PROFILE_SECTIONS = new Set(["followers", "following", "about"])

type Check = (viewerId: string) => Promise<boolean>

// Returns true when the page for this path would answer 404 for this person. A request with no valid session is left to
// the page, which sends it to sign-in. A path with no check here is left to its page too.
export async function pageMissing(pathname: string, token: string): Promise<boolean> {
  try {
    const parts = pathname
      .split("/")
      .filter(Boolean)
      .map((part) => decodeURIComponent(part))
    const check = checkFor(parts)
    if (!check) return false
    const viewerId = await viewerIdFor(token)
    if (!viewerId) return false
    return await check(viewerId)
  } catch {
    // If the check cannot run, the page's own check still answers, as it did before this gate.
    return false
  }
}

function checkFor(parts: string[]): Check | null {
  const [first = "", second = "", third = ""] = parts

  if (parts.length === 2) {
    if (first === "messages" && second !== "new") return async (viewer) => (await conversationFor(second, viewer)) === null
    if (first === "lists") return async (viewer) => (await openList(second, viewer)) === null
    if (first === "circles" && second !== "new") return async (viewer) => (await openCircle(second, viewer)) === null
    if (first === "topics") return async () => !topicFromParam(second).ok
    // A group invite link that was never made, was reset, or was turned off.
    if (first === "join") return async () => (await groupForInvite(second)) === null
  }

  // A profile, or one of its sections, and a post under the profile. The handle must be one an account can have and must
  // not be a route name. Names that begin with two underscores are Next's own development routes.
  if (HANDLE_PATTERN.test(first) && !RESERVED_HANDLES.has(first) && !first.startsWith("__")) {
    if (parts.length === 1 || (parts.length === 2 && PROFILE_SECTIONS.has(second))) {
      return (viewer) => profileMissing(first, viewer)
    }
    if (parts.length === 3 && second === "status") return async (viewer) => !(await canSeePost(third, viewer))
    // A post's analytics: only its author sees them, and only for a published post. This is the first check of that page.
    if (parts.length === 4 && second === "status" && parts[3] === "analytics") return async (viewer) => !(await ownPublishedPost(third, viewer))
  }

  return null
}

// The profile page's own refusal, in one query: no such account, an account that is deactivated (its owner excepted), or one
// that has blocked the viewer. The page reads the same three facts in getProfileByHandle and relationshipWith.
async function profileMissing(handle: string, viewerId: string): Promise<boolean> {
  const row = await get<{ id: string; deactivated: number; blocked_me: number }>(
    `SELECT u.id, u.deactivated_at IS NOT NULL AS deactivated,
       EXISTS(SELECT 1 FROM blocks b WHERE b.blocker_id = u.id AND b.blocked_id = ?) AS blocked_me
     FROM users u WHERE u.handle = ?`,
    viewerId,
    handle
  )
  if (!row) return true
  return (Boolean(row.deactivated) && row.id !== viewerId) || Boolean(row.blocked_me)
}

// A post its author has published, not a draft or a scheduled post. The post analytics page checks this first (postAnalytics).
async function ownPublishedPost(postId: string, viewerId: string): Promise<boolean> {
  const row = await get<{ id: string }>(
    "SELECT p.id FROM posts p WHERE p.id = ? AND p.author_id = ? AND p.is_draft = 0 AND p.publish_at IS NULL",
    postId,
    viewerId
  )
  return Boolean(row)
}

// The person behind the session cookie. Matches getViewer: an expired session or a deactivated account has none.
async function viewerIdFor(token: string): Promise<string | null> {
  const row = await get<{ id: string }>(
    `SELECT u.id FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ? AND u.deactivated_at IS NULL`,
    hashToken(token),
    Date.now()
  )
  return row?.id ?? null
}
