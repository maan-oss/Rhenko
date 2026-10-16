import { all, get, run } from "@/lib/db"

// The most accounts one viewer can put in Priority. Keeps the Priority query small.
export const MAX_PRIORITY_ACCOUNTS = 50

// A priority account only counts while the viewer still follows it. If they unfollow, the row stays but does nothing.
export function priorityAccountCount(viewerId: string): number {
  return (
    get<{ c: number }>(
      `SELECT COUNT(*) AS c FROM priority_accounts pa
       JOIN follows f ON f.follower_id = pa.user_id AND f.followee_id = pa.account_id
       WHERE pa.user_id = ?`,
      viewerId
    )?.c ?? 0
  )
}

export function isPriorityAccount(viewerId: string, accountId: string): boolean {
  return get("SELECT 1 AS found FROM priority_accounts WHERE user_id = ? AND account_id = ?", viewerId, accountId) !== undefined
}

// The accounts the viewer follows, with whether each is in Priority. Priority ones come first, for the settings list.
export function followedAccountsForPriority(
  viewerId: string,
  limit = 300
): { id: string; handle: string; name: string; avatarFile: string | null; verified: boolean; priority: boolean }[] {
  return all<{ id: string; handle: string; name: string; avatar_file: string | null; verified: number; priority: number }>(
    `SELECT u.id, u.handle, u.name, u.avatar_file, u.verified, (pa.account_id IS NOT NULL) AS priority
     FROM follows f
     JOIN users u ON u.id = f.followee_id AND u.deactivated_at IS NULL
     LEFT JOIN priority_accounts pa ON pa.user_id = f.follower_id AND pa.account_id = f.followee_id
     WHERE f.follower_id = ?
     ORDER BY priority DESC, u.handle COLLATE NOCASE
     LIMIT ?`,
    viewerId,
    limit
  ).map((r) => ({ id: r.id, handle: r.handle, name: r.name, avatarFile: r.avatar_file, verified: r.verified === 1, priority: r.priority === 1 }))
}

export function setPriorityAccount(viewerId: string, accountId: string, on: boolean, now: number): void {
  if (on) {
    run(
      "INSERT INTO priority_accounts (user_id, account_id, created_at) VALUES (?, ?, ?) ON CONFLICT (user_id, account_id) DO NOTHING",
      viewerId,
      accountId,
      now
    )
  } else {
    run("DELETE FROM priority_accounts WHERE user_id = ? AND account_id = ?", viewerId, accountId)
  }
}
