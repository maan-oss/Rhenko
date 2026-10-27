import { randomBytes } from "node:crypto"
import { get } from "@/lib/db"
import { isInviteToken } from "@/lib/invite-links"

// A group as its invite link shows it to someone who is not in it yet: its name and how many people it has, nothing else.
export type GroupInvite = { conversationId: string; title: string; memberCount: number }

// Where the viewer stands with a group they opened a link to. `blocked` is true when they and anyone in the group have
// blocked each other, in either direction: everyone in a group sees everyone else, so they can't join it.
export type InviteStanding = { status: "accepted" | "requested" | null; blocked: boolean }

// A token for a new invite link. It is the only thing the link carries, so it is long and random.
export function newInviteToken(): string {
  return randomBytes(16).toString("base64url")
}

// The group an invite link opens, or null when the link is not one, was reset, or was turned off. The join page and the
// proxy's check (lib/route-gate.ts) both ask this, so they agree on which links are "not here". The count includes people
// invited who have not accepted yet, as the group's own size limit does.
export async function groupForInvite(token: string): Promise<GroupInvite | null> {
  if (!isInviteToken(token)) return null
  const row = await get<{ id: string; title: string; members: number }>(
    `SELECT c.id, c.title, (SELECT COUNT(*) FROM conversation_members m WHERE m.conversation_id = c.id) AS members
     FROM conversations c WHERE c.invite_token = ? AND c.kind = 'group'`,
    token
  )
  return row ? { conversationId: row.id, title: row.title, memberCount: row.members } : null
}

export async function inviteStanding(conversationId: string, viewerId: string): Promise<InviteStanding> {
  const row = await get<{ status: "accepted" | "requested" | null; blocked: number }>(
    `SELECT
       (SELECT status FROM conversation_members WHERE conversation_id = ?1 AND user_id = ?2) AS status,
       EXISTS (
         SELECT 1 FROM conversation_members m JOIN blocks b
           ON (b.blocker_id = m.user_id AND b.blocked_id = ?2) OR (b.blocker_id = ?2 AND b.blocked_id = m.user_id)
         WHERE m.conversation_id = ?1 AND m.user_id <> ?2
       ) AS blocked`,
    conversationId,
    viewerId
  )
  return { status: row?.status ?? null, blocked: row?.blocked === 1 }
}
