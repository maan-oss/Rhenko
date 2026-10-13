// Circles: small groups inside Rhenko. Each one has a name, a tagline, a charter of its own rules, and an access setting.
// Open circles take anyone who joins. Ask-to-join circles keep each applicant's answer to the circle's question until the
// owner decides. Closed circles are invite-only, and their posts are shown only to their members (and to the person who
// wrote each one). Feeds, search, replies and single-post pages all apply that rule through lib/data.ts.
import { randomBytes } from "node:crypto"
import { all, get, run } from "@/lib/db"
import type { MiniUser } from "@/lib/data"
import type { CircleAccess } from "@/lib/rules"

export type CircleRole = "owner" | "member"

export type Circle = {
  id: string
  slug: string
  name: string
  tagline: string
  charter: string
  joinQuestion: string
  access: CircleAccess
  memberCount: number
  createdAt: number
  owner: MiniUser | null
  // The viewer's role here, or null when they are not a member.
  role: CircleRole | null
  // Whether the viewer has asked to join and is waiting for an answer.
  requested: boolean
}

type CircleRow = {
  id: string
  slug: string
  name: string
  tagline: string
  charter: string
  join_question: string
  access: CircleAccess
  created_at: number
  member_count: number
  my_role: CircleRole | null
  my_request: number
  owner_id: string | null
  owner_handle: string | null
  owner_name: string | null
  owner_avatar: string | null
  owner_verified: number | null
}

// Every circle column a page needs, with the viewer's own membership and request. Two viewer ids are bound first.
const CIRCLE_SELECT = `SELECT c.id, c.slug, c.name, c.description AS tagline, c.charter, c.join_question, c.access, c.created_at,
    (SELECT COUNT(*) FROM community_members m WHERE m.community_id = c.id) AS member_count,
    (SELECT m.role FROM community_members m WHERE m.community_id = c.id AND m.user_id = ?) AS my_role,
    EXISTS(SELECT 1 FROM community_requests r WHERE r.community_id = c.id AND r.user_id = ?) AS my_request,
    c.owner_id, ou.handle AS owner_handle, ou.name AS owner_name, ou.avatar_file AS owner_avatar, ou.verified AS owner_verified
  FROM communities c LEFT JOIN users ou ON ou.id = c.owner_id`

function toCircle(row: CircleRow): Circle {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    charter: row.charter,
    joinQuestion: row.join_question,
    access: row.access,
    memberCount: row.member_count,
    createdAt: row.created_at,
    owner:
      row.owner_id && row.owner_handle
        ? {
            id: row.owner_id,
            handle: row.owner_handle,
            name: row.owner_name ?? "",
            avatarFile: row.owner_avatar,
            verified: row.owner_verified === 1,
          }
        : null,
    role: row.my_role,
    requested: row.my_request === 1,
  }
}

export function circleBySlug(slug: string, viewerId: string): Circle | null {
  const row = get<CircleRow>(`${CIRCLE_SELECT} WHERE c.slug = ?`, viewerId, viewerId, slug)
  return row ? toCircle(row) : null
}

// The circles the viewer belongs to, by name.
export function circlesFor(viewerId: string): Circle[] {
  return all<CircleRow>(
    `${CIRCLE_SELECT} WHERE c.id IN (SELECT community_id FROM community_members WHERE user_id = ?) ORDER BY c.name COLLATE NOCASE`,
    viewerId,
    viewerId,
    viewerId
  ).map(toCircle)
}

// Circles the viewer can find and join: open and ask-to-join circles they are not in yet, largest first. A closed circle
// is never listed here, because its existence is shared only with its members.
export function discoverCircles(viewerId: string, query: string, limit = 30): Circle[] {
  const words = query.trim().toLowerCase()
  const filter = words ? "AND lower(c.name) LIKE ? ESCAPE '\\'" : ""
  const params: (string | number)[] = [viewerId, viewerId, viewerId]
  if (words) params.push(`%${words.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`)
  params.push(limit)
  return all<CircleRow>(
    `${CIRCLE_SELECT}
     WHERE c.access <> 'closed' AND c.id NOT IN (SELECT community_id FROM community_members WHERE user_id = ?) ${filter}
     ORDER BY member_count DESC, c.created_at DESC
     LIMIT ?`,
    ...params
  ).map(toCircle)
}

export function memberRole(circleId: string, userId: string): CircleRole | null {
  const row = get<{ role: CircleRole }>(
    "SELECT role FROM community_members WHERE community_id = ? AND user_id = ?",
    circleId,
    userId
  )
  return row?.role ?? null
}

export function isOwner(circleId: string, userId: string): boolean {
  return get("SELECT 1 AS found FROM communities WHERE id = ? AND owner_id = ?", circleId, userId) !== undefined
}

// Members, owner first, then in the order they joined.
export function circleMembers(circleId: string): { user: MiniUser; role: CircleRole }[] {
  return all<{ id: string; handle: string; name: string; avatar_file: string | null; verified: number; role: CircleRole }>(
    `SELECT u.id, u.handle, u.name, u.avatar_file, u.verified, m.role
     FROM community_members m JOIN users u ON u.id = m.user_id
     WHERE m.community_id = ? AND u.deactivated_at IS NULL
     ORDER BY (m.role = 'owner') DESC, m.created_at ASC
     LIMIT 500`,
    circleId
  ).map((r) => ({
    user: { id: r.id, handle: r.handle, name: r.name, avatarFile: r.avatar_file, verified: r.verified === 1 },
    role: r.role,
  }))
}

// People waiting for an answer, oldest first. Only the owner reads this.
export function circleRequests(circleId: string): { user: MiniUser; answer: string; createdAt: number }[] {
  return all<{
    id: string
    handle: string
    name: string
    avatar_file: string | null
    verified: number
    answer: string
    created_at: number
  }>(
    `SELECT u.id, u.handle, u.name, u.avatar_file, u.verified, r.answer, r.created_at
     FROM community_requests r JOIN users u ON u.id = r.user_id
     WHERE r.community_id = ? AND u.deactivated_at IS NULL
     ORDER BY r.created_at ASC
     LIMIT 200`,
    circleId
  ).map((r) => ({
    user: { id: r.id, handle: r.handle, name: r.name, avatarFile: r.avatar_file, verified: r.verified === 1 },
    answer: r.answer,
    createdAt: r.created_at,
  }))
}

// A web address for a new circle, made from its name. The name is ASCII-folded, so "Café Club" becomes cafe-club. A
// name with no letters or digits gets "circle", and a taken address gets a short random ending.
export function slugFor(name: string): string {
  const folded = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/-+$/, "")
  if (!folded) return "circle"
  // "new" is the page for starting a circle, so a circle cannot take that address.
  return folded === "new" ? "new-circle" : folded
}

export function uniqueSlug(name: string): string {
  const base = slugFor(name)
  const taken = (slug: string) => get("SELECT 1 AS found FROM communities WHERE slug = ?", slug) !== undefined
  if (!taken(base)) return base
  for (;;) {
    const candidate = `${base}-${randomBytes(3).toString("hex")}`
    if (!taken(candidate)) return candidate
  }
}

// Media files of the posts in a circle. The caller removes them once the change is saved.
function mediaOfCircle(circleId: string): string[] {
  return all<{ file: string }>(
    "SELECT m.file FROM post_media m JOIN posts p ON p.id = m.post_id WHERE p.community_id = ?",
    circleId
  ).map((r) => r.file)
}

// Deletes a circle's rows. Posts in an open or ask-to-join circle stay on the site as ordinary posts. A closed circle's
// posts were only ever shown to its members, so they go with it, and their files come back to be removed.
// Callers run this inside their own transaction.
export function closeCircle(circleId: string, access: CircleAccess): string[] {
  const files = access === "closed" ? mediaOfCircle(circleId) : []
  if (access === "closed") run("DELETE FROM posts WHERE community_id = ?", circleId)
  run("DELETE FROM communities WHERE id = ?", circleId)
  return files
}

// Run when an account is erased, before its rows go. A circle it owned passes to the member who joined first. A circle
// with nobody else in it closes. Returns the files that closing removed.
export function releaseCirclesOf(userId: string): string[] {
  const files: string[] = []
  const owned = all<{ id: string; access: CircleAccess }>("SELECT id, access FROM communities WHERE owner_id = ?", userId)
  for (const circle of owned) {
    const heir = get<{ user_id: string }>(
      "SELECT user_id FROM community_members WHERE community_id = ? AND user_id <> ? ORDER BY created_at ASC LIMIT 1",
      circle.id,
      userId
    )
    if (heir) {
      run("UPDATE communities SET owner_id = ?, updated_at = ? WHERE id = ?", heir.user_id, Date.now(), circle.id)
      run("UPDATE community_members SET role = 'owner' WHERE community_id = ? AND user_id = ?", circle.id, heir.user_id)
    } else {
      files.push(...closeCircle(circle.id, circle.access))
    }
  }
  return files
}
