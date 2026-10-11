import { all, get } from "@/lib/db"
import { pendingEmailCode, secondFactorState, type SecondFactorState } from "@/lib/auth"
import type { CodeNeed } from "@/lib/account-rules"
import { mailConfigured } from "@/lib/mail"

// Email features need SMTP in production. Elsewhere, messages are printed to the server log so the flows can be tried.
export function emailReady(): boolean {
  return process.env.NODE_ENV !== "production" || mailConfigured()
}

export const NOTIFICATION_KINDS = ["like", "repost", "reply", "quote", "follow", "mention", "follow_request", "poll", "post"] as const
export type PrefKind = (typeof NOTIFICATION_KINDS)[number]

// What each switch controls. Each line matches where that notification is sent.
export const NOTIFICATION_LABELS: Record<PrefKind, { title: string; hint: string }> = {
  like: { title: "Likes", hint: "When someone likes one of your posts or replies." },
  repost: { title: "Reposts", hint: "When someone reposts one of your posts or replies." },
  reply: { title: "Replies", hint: "When someone replies to one of your posts." },
  quote: { title: "Quotes", hint: "When someone quotes one of your posts." },
  follow: { title: "New followers", hint: "When someone follows you, or accepts your request to follow them." },
  mention: { title: "Mentions", hint: "When someone mentions your handle in a post." },
  follow_request: { title: "Follow requests", hint: "When someone asks to follow you while your posts are protected." },
  poll: { title: "Poll results", hint: "When a poll you voted in ends." },
  post: {
    title: "New posts",
    hint: "When an account you follow posts, if you turned on post notifications on its profile. Replies aren't included.",
  },
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

export function twoFactorFor(userId: string): SecondFactorState {
  return secondFactorState(userId)
}

// Which code, if any, a sensitive change on the account page asks for.
export function codeNeedFor(userId: string): CodeNeed {
  const state = secondFactorState(userId)
  if (!state.enabled) return "none"
  return state.usable ? "app" : "recovery"
}

export type EmailSettings = {
  email: string | null
  verified: boolean
  // A verification code that is out and still valid, and the address it went to.
  pending: { target: string; expiresAt: number } | null
  // False in production when SMTP isn't set up, so codes can't be sent.
  ready: boolean
}

export function emailSettingsFor(userId: string): EmailSettings {
  const row = get<{ email: string | null; email_verified_at: number | null }>(
    "SELECT email, email_verified_at FROM users WHERE id = ?",
    userId
  )
  return {
    email: row?.email ?? null,
    verified: typeof row?.email_verified_at === "number",
    pending: pendingEmailCode(userId, "verify"),
    ready: emailReady(),
  }
}
