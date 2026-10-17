import { all, run } from "@/lib/db"

// How long a snooze keeps a topic out of For you, in milliseconds. The topic stays followed for the whole time.
export const SNOOZE_MS = 30 * 24 * 60 * 60 * 1000

// The topics the viewer has snoozed at this time, as tags without the #.
export async function snoozedTopics(viewerId: string, now: number): Promise<Set<string>> {
  return new Set((await all<{ tag: string }>("SELECT tag FROM topic_snoozes WHERE user_id = ? AND until_at > ?", viewerId, now)).map((row) => row.tag))
}

// The snoozes still running, soonest to end last, for the settings page.
export async function snoozesFor(viewerId: string, now: number): Promise<{ tag: string; untilAt: number }[]> {
  return (await all<{ tag: string; until_at: number }>(
    "SELECT tag, until_at FROM topic_snoozes WHERE user_id = ? AND until_at > ? ORDER BY until_at DESC",
    viewerId,
    now
  )).map((row) => ({ tag: row.tag, untilAt: row.until_at }))
}

// Snoozing a topic again restarts its time.
export async function snoozeTopic(viewerId: string, tag: string, now: number): Promise<void> {
  await run(
    `INSERT INTO topic_snoozes (user_id, tag, until_at, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (user_id, tag) DO UPDATE SET until_at = excluded.until_at, created_at = excluded.created_at`,
    viewerId,
    tag,
    now + SNOOZE_MS,
    now
  )
}

export async function unsnoozeTopic(viewerId: string, tag: string): Promise<void> {
  await run("DELETE FROM topic_snoozes WHERE user_id = ? AND tag = ?", viewerId, tag)
}
