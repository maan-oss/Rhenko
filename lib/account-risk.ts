// How likely an account is to be a bot, a fake or a farm, from what it has done. Pure: it scores numbers that lib/risk.ts
// counts from the database, so the thresholds can be tested without one.
//
// A new person who has simply not confirmed an email scores low. A network that many accounts share is a weak signal:
// many people share a mobile carrier's address or an office, so it can add to a score but never restricts on its own.
// The levels:
//   ok:        nothing happens.
//   challenge: following, starting a conversation and posting ask for a human check first.
//   restrict:  following, starting a conversation and posting are refused for a while. The window moves with the counts,
//              so an account that stops does not stay restricted.

export const CHALLENGE_AT = 40
export const RESTRICT_AT = 70

export type AccountFacts = {
  accountAgeHours: number
  emailVerified: boolean
  // No bio and no picture.
  emptyProfile: boolean
  // Digits at the end of the handle, such as "maria48213".
  trailingDigits: number
  // Other accounts made from the same network in the last week. Zero when the network is not known.
  sameNetworkAccounts: number
  followsLastHour: number
  followsLastDay: number
  likesLastHour: number
  repostsLastHour: number
  // Conversations this account started in the last hour.
  newChatsLastHour: number
  // Different accounts that reported this account or its posts in the last 30 days.
  reporters30Days: number
  // Spam removals the account has been given and not had reversed.
  spamNotices: number
  isBot: boolean
}

export type AccountLevel = "ok" | "challenge" | "restrict"
export type AccountVerdict = { score: number; level: AccountLevel; reasons: string[] }

type Item = { points: number; reason: string }

function tier(value: number, tiers: [number, number, string][]): Item | null {
  let hit: Item | null = null
  for (const [at, points, reason] of tiers) {
    if (value >= at) hit = { points, reason }
  }
  return hit
}

export function assessAccount(facts: AccountFacts): AccountVerdict {
  // Sockpuppet farms are judged by their own accounts, so Sahayak and other bot accounts are never scored.
  if (facts.isBot) return { score: 0, level: "ok", reasons: [] }

  const found: Item[] = []
  const add = (points: number, reason: string) => found.push({ points, reason })
  const addTier = (value: number, tiers: [number, number, string][]) => {
    const hit = tier(value, tiers)
    if (hit) found.push(hit)
  }

  // The account itself.
  if (facts.accountAgeHours < 24) add(15, "was made less than a day ago")
  else if (facts.accountAgeHours < 168) add(6, "was made less than a week ago")
  if (!facts.emailVerified) add(facts.accountAgeHours < 720 ? 12 : 4, "has not confirmed an email address")
  if (facts.emptyProfile && facts.accountAgeHours < 72) add(8, "has an empty profile")
  if (facts.trailingDigits >= 4 && facts.accountAgeHours < 168) add(8, "has a handle of many digits, made recently")

  // Where it was made from. Weak on purpose: see the note at the top.
  addTier(facts.sameNetworkAccounts, [
    [3, 10, "was made from a network that made several other accounts"],
    [6, 20, "was made from a network that made many other accounts"],
  ])

  // What it does, measured per hour and per day.
  addTier(facts.followsLastHour, [
    [30, 35, "follows people very fast"],
    [60, 50, "follows people in a flood"],
  ])
  addTier(facts.followsLastDay, [[100, 30, "follows a very large number of people in a day"]])
  addTier(facts.likesLastHour, [
    [150, 25, "likes posts very fast"],
    [400, 45, "likes posts in a flood"],
  ])
  addTier(facts.repostsLastHour, [[60, 25, "reposts very fast"]])
  addTier(facts.newChatsLastHour, [
    [8, 35, "starts many new conversations"],
    [20, 50, "starts conversations in a flood"],
  ])

  // What other people say about it.
  addTier(facts.reporters30Days, [
    [3, 20, "has been reported by several people"],
    [8, 35, "has been reported by many people"],
  ])
  if (facts.spamNotices >= 1) add(20, "has had spam removed before")

  found.sort((a, b) => b.points - a.points)
  const score = Math.min(100, found.reduce((sum, item) => sum + item.points, 0))
  const level: AccountLevel = score >= RESTRICT_AT ? "restrict" : score >= CHALLENGE_AT ? "challenge" : "ok"
  return { score, level, reasons: found.map((item) => item.reason) }
}
