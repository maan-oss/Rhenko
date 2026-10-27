// How connection suggestions are grouped, ordered and explained. Pure: lib/connections.ts gathers the facts from the
// database, and this file decides the group, the order and the reasons. Every reason shown to someone is one of the
// facts below, so the transparency page can describe them exactly, and nothing else is used.

// "starting" is not a match: it holds people to start with when nothing matches yet, so a new account never sees an empty page.
export type Group = "exchange" | "nearby" | "mutual" | "language" | "interest" | "starting"

// The order the groups are shown in. A person is listed once, under the first group they qualify for.
export const GROUP_ORDER: readonly Group[] = ["exchange", "nearby", "mutual", "language", "interest"]

export const GROUP_TEXT: Readonly<Record<Group, { title: string; description: string }>> = {
  exchange: { title: "Language swaps", description: "You can each help the other practise a language." },
  nearby: { title: "Near you", description: "Same city or town, and you both turned it on." },
  mutual: { title: "Followed by people you follow", description: "People you follow follow them too." },
  language: { title: "Speaks your languages", description: "Speaks a language you speak or are learning." },
  interest: { title: "Writes about your topics", description: "Recently posted about a topic you follow." },
  starting: { title: "People to start with", description: "Not matched to you yet. Follow a few to fill your feed." },
}

const DAY = 24 * 60 * 60 * 1000
const ACTIVE_MS = 14 * DAY

// What is known about the viewer. Languages are empty when language suggestions are off for the viewer, and the area is
// null when nearby suggestions are off or no area is set, so a switched-off signal never contributes.
export type Me = {
  speaks: readonly string[]
  learns: readonly string[]
  area: string | null
  topics: readonly string[]
}

// What is known about someone who could be suggested. `sameArea` is true only when both people have turned nearby
// suggestions on. Languages are empty when that person has turned language suggestions off.
export type Candidate = {
  id: string
  sameArea: boolean
  speaks: readonly string[]
  learns: readonly string[]
  mutual: number
  mutualHandles: readonly string[]
  topics: readonly string[]
  followers: number
  activeAt: number | null
}

export type Facts = {
  // What they speak that you are learning.
  teaches: string[]
  // What you speak that they are learning.
  learnsFromYou: string[]
  // What you both speak.
  shared: string[]
  sameArea: boolean
  mutual: number
  topics: string[]
}

function intersect(a: readonly string[], b: readonly string[]): string[] {
  const other = new Set(b)
  return [...new Set(a)].filter((code) => other.has(code))
}

export function factsOf(me: Me, candidate: Candidate): Facts {
  return {
    teaches: intersect(me.learns, candidate.speaks),
    learnsFromYou: intersect(me.speaks, candidate.learns),
    shared: intersect(me.speaks, candidate.speaks),
    sameArea: candidate.sameArea && me.area !== null,
    mutual: candidate.mutual,
    topics: intersect(me.topics, candidate.topics),
  }
}

// The strongest group a person qualifies for, or null when nothing in common was found.
export function groupOf(facts: Facts): Group | null {
  if (facts.teaches.length > 0 && facts.learnsFromYou.length > 0) return "exchange"
  if (facts.sameArea) return "nearby"
  if (facts.mutual > 0) return "mutual"
  if (facts.shared.length > 0 || facts.teaches.length > 0 || facts.learnsFromYou.length > 0) return "language"
  if (facts.topics.length > 0) return "interest"
  return null
}

// How well a person fits, for ordering inside a group. Only the facts above count, and recent activity and a larger
// following count a little, so a quiet account does not outrank an active one with the same ties.
export function scoreOf(facts: Facts, candidate: Candidate, now: number): number {
  let score = 0
  if (facts.teaches.length > 0 && facts.learnsFromYou.length > 0) score += 4
  if (facts.sameArea) score += 2
  score += 0.6 * Math.min(facts.mutual, 5)
  if (facts.shared.length > 0) score += 1 + 0.3 * Math.min(facts.shared.length, 3)
  if (facts.teaches.length > 0 || facts.learnsFromYou.length > 0) score += 1
  score += 0.7 * Math.min(facts.topics.length, 3)
  score += 0.2 * Math.log10(1 + candidate.followers)
  if (candidate.activeAt !== null && now - candidate.activeAt <= ACTIVE_MS) score += 0.5
  return score
}

// Names a short list the way a sentence would: "A", "A and B", "A, B and C".
function listOf(names: readonly string[]): string {
  const shown = names.slice(0, 3)
  if (shown.length <= 1) return shown[0] ?? ""
  return `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`
}

function mutualReason(total: number, handles: readonly string[]): string {
  const first = handles[0]
  if (!first) return `Followed by ${total} ${total === 1 ? "person" : "people"} you follow`
  if (total <= 1) return `Followed by @${first}, who you follow`
  return `Followed by @${first} and ${total - 1} more you follow`
}

// The reasons a person is suggested, most useful first. `nameOf` turns a language code into its name. The first two are
// shown on a card, and every reason is listed in the transparency page's description of the signals.
export function reasonsOf(me: Me, candidate: Candidate, facts: Facts, nameOf: (code: string) => string): string[] {
  const reasons: string[] = []
  const swap = facts.teaches.length > 0 && facts.learnsFromYou.length > 0
  if (swap) reasons.push(`Language swap: ${nameOf(facts.teaches[0])} for ${nameOf(facts.learnsFromYou[0])}`)
  if (facts.sameArea && me.area) reasons.push(`In ${me.area}, like you`)
  if (facts.mutual > 0) reasons.push(mutualReason(facts.mutual, candidate.mutualHandles))
  if (facts.shared.length > 0) reasons.push(`Speaks ${listOf(facts.shared.map(nameOf))}, like you`)
  if (!swap && facts.teaches.length > 0) reasons.push(`Speaks ${listOf(facts.teaches.map(nameOf))}, which you are learning`)
  if (!swap && facts.learnsFromYou.length > 0) reasons.push(`Learning ${listOf(facts.learnsFromYou.map(nameOf))}, which you speak`)
  if (facts.topics.length > 0) reasons.push(`Writes about ${listOf(facts.topics.map((tag) => (tag.startsWith("$") ? tag : `#${tag}`)))}, which you follow`)
  return reasons
}

export type Ranked = { candidate: Candidate; group: Group; score: number; facts: Facts }

// Every candidate with a reason, sorted into their groups, best first. The ids break ties, so the same data always gives
// the same order.
export function rankConnections(me: Me, candidates: readonly Candidate[], now: number): Map<Group, Ranked[]> {
  const groups = new Map<Group, Ranked[]>(GROUP_ORDER.map((group) => [group, []] as const))
  for (const candidate of candidates) {
    const facts = factsOf(me, candidate)
    const group = groupOf(facts)
    if (group === null) continue
    groups.get(group)?.push({ candidate, group, score: scoreOf(facts, candidate, now), facts })
  }
  for (const list of groups.values()) {
    list.sort((a, b) => b.score - a.score || (a.candidate.id < b.candidate.id ? -1 : a.candidate.id > b.candidate.id ? 1 : 0))
  }
  return groups
}
