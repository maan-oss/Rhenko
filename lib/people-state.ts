import { all } from "@/lib/db"
import type { UserCard } from "@/lib/data"
import type { PersonEntry } from "@/lib/social-rules"

// Server-side lookups that tell a list of people how the viewer stands with each of them.

// A person card does not say whether the viewer has asked to follow a protected account. This adds it, so a pending
// request reads "Requested" in a list and not "Follow".
export function withRequested(viewerId: string, users: UserCard[]): PersonEntry[] {
  const ids = [...new Set(users.filter((user) => !user.following && user.id !== viewerId).map((user) => user.id))]
  if (ids.length === 0) return users.map((user) => ({ ...user, requested: false }))
  const rows = all<{ target_id: string }>(
    `SELECT target_id FROM follow_requests WHERE requester_id = ? AND target_id IN (${ids.map(() => "?").join(",")})`,
    viewerId,
    ...ids
  )
  const pending = new Set(rows.map((row) => row.target_id))
  return users.map((user) => ({ ...user, requested: pending.has(user.id) }))
}

// Which of these accounts may have their lists shown to the viewer: the account is still there, and it has not blocked
// the viewer.
export function listOwnersVisibleTo(viewerId: string, ownerIds: string[]): Set<string> {
  const ids = [...new Set(ownerIds)]
  if (ids.length === 0) return new Set()
  const rows = all<{ id: string }>(
    `SELECT u.id FROM users u
     WHERE u.id IN (${ids.map(() => "?").join(",")}) AND u.deactivated_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM blocks b WHERE b.blocker_id = u.id AND b.blocked_id = ?)`,
    ...ids,
    viewerId
  )
  return new Set(rows.map((row) => row.id))
}
