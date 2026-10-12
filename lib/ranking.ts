// Ranking for the For you feed. Pure: it takes candidates with their counts and times and returns them in the order to show.
// lib/data.ts reads the candidates and makes the snapshot; nothing here touches the database.
//
// The score is how recent a post is, times how much people have engaged with it, times two boosts: one when the viewer
// follows the author (or whoever reposted it), one when the post uses a hashtag the viewer follows. Recency halves every
// twelve hours, so a post from three days ago is still possible but rarely wins against a fresh one.

const HOUR = 60 * 60 * 1000

export const RANK_WINDOW_MS = 72 * HOUR
export const HALF_LIFE_MS = 12 * HOUR
// At most this many posts from one author among the top picks. The rest of that author's posts come after everyone else's.
export const PER_AUTHOR = 2

export type Candidate = {
  // "post:<id>" for a post, "repost:<post>:<reposter>" for a repost. Unique within a feed.
  key: string
  postId: string
  authorId: string
  // When the item reached the feed: the post's time, or the repost's time for a repost.
  at: number
  reposterId: string | null
  // The viewer follows the author, or (for a repost) the person who reposted.
  followed: boolean
  // The post uses a hashtag the viewer follows.
  topic: boolean
  likes: number
  reposted: number
  replies: number
  quotes: number
  views: number
}

// Engagement on a log scale, so the tenth like counts for less than the first. A repost and a quote say more than a like,
// and a reply more than a like. Views count for very little: they are easy to inflate and everyone sees them.
export function engagement(c: Pick<Candidate, "likes" | "reposted" | "replies" | "quotes" | "views">): number {
  const weighted = c.likes + 2 * c.reposted + 2 * c.quotes + 1.5 * c.replies + 0.02 * c.views
  return Math.log2(1 + weighted)
}

export function score(c: Candidate, now: number): number {
  const ageMs = Math.max(0, now - c.at)
  const recency = Math.pow(0.5, ageMs / HALF_LIFE_MS)
  let value = recency * (1 + engagement(c))
  if (c.followed) value *= 2
  if (c.topic) value *= 1.25
  return value
}

// The candidates in feed order, best first, with at most `limit` of them. Ties go to the newer item, then to the key, so the
// same inputs always give the same order.
export function rank(candidates: Candidate[], now: number, limit: number): Candidate[] {
  const scored = candidates
    .map((candidate) => ({ candidate, value: score(candidate, now) }))
    .sort((a, b) => b.value - a.value || b.candidate.at - a.candidate.at || (a.candidate.key < b.candidate.key ? -1 : a.candidate.key > b.candidate.key ? 1 : 0))
  const taken = new Map<string, number>()
  const head: Candidate[] = []
  const tail: Candidate[] = []
  for (const { candidate } of scored) {
    const count = taken.get(candidate.authorId) ?? 0
    if (count < PER_AUTHOR) {
      head.push(candidate)
      taken.set(candidate.authorId, count + 1)
    } else {
      tail.push(candidate)
    }
  }
  return [...head, ...tail].slice(0, limit)
}
