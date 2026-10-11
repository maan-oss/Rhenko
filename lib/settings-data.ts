import { all, get } from "@/lib/db"

export const NOTIFICATION_KINDS = ["like", "repost", "reply", "quote", "follow", "mention", "follow_request", "poll"] as const
export type PrefKind = (typeof NOTIFICATION_KINDS)[number]

export const NOTIFICATION_LABELS: Record<PrefKind, { title: string; hint: string }> = {
  like: { title: "Likes", hint: "When someone likes your post" },
  repost: { title: "Reposts", hint: "When someone reposts your post" },
  reply: { title: "Replies", hint: "When someone replies to you" },
  quote: { title: "Quotes", hint: "When someone quotes your post" },
  follow: { title: "New followers", hint: "When someone follows you" },
  mention: { title: "Mentions", hint: "When someone mentions you" },
  follow_request: { title: "Follow requests", hint: "When someone asks to follow a protected account you run" },
  poll: { title: "Polls", hint: "When a poll you voted in or made ends" },
}

export type SessionRow = {
  tokenHash: string
  createdAt: number
  lastSeen: number
  userAgent: string
}

// Sessions that have not expired, most recently used first.
export function sessionsFor(userId: string): SessionRow[] {
  return all<{ token_hash: string; created_at: number; last_seen: number; user_agent: string }>(
    "SELECT token_hash, created_at, last_seen, user_agent FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY last_seen DESC",
    userId,
    Date.now()
  ).map((r) => ({ tokenHash: r.token_hash, createdAt: r.created_at, lastSeen: r.last_seen, userAgent: r.user_agent }))
}

// Every kind is on unless the person turned it off.
export function notificationPrefsFor(userId: string): Record<PrefKind, boolean> {
  const rows = all<{ kind: string; enabled: number }>("SELECT kind, enabled FROM notification_prefs WHERE user_id = ?", userId)
  const result = Object.fromEntries(NOTIFICATION_KINDS.map((kind) => [kind, true])) as Record<PrefKind, boolean>
  for (const row of rows) {
    if ((NOTIFICATION_KINDS as readonly string[]).includes(row.kind)) result[row.kind as PrefKind] = row.enabled === 1
  }
  return result
}

export function recoveryCodesLeft(userId: string): number {
  return get<{ c: number }>("SELECT COUNT(*) AS c FROM recovery_codes WHERE user_id = ? AND used_at IS NULL", userId)?.c ?? 0
}
