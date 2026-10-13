// Connection suggestions and the settings behind them. lib/connection-rank.ts decides the groups and the reasons; this
// file reads the facts from the database and writes the settings. Server only.
//
// What is read, and only for these purposes:
//   the country and city or town     matching people nearby, only when both people have turned that on
//   the languages and their levels   matching language partners, only when both people have turned that on
//   the topics a person follows      matching people who posted about them in the last 30 days
//   who a person follows             people followed by the people they follow
// The city or town is never shown to anyone else, and never on a profile. A suggestion says why it is there, and only
// the facts above are used.
import { all, get, run, transaction } from "@/lib/db"
import { languageName, type SpeakLevel } from "@/lib/languages"
import { areaKey, cleanArea, countryName } from "@/lib/places"
import { GROUP_ORDER, GROUP_TEXT, rankConnections, reasonsOf, type Candidate, type Group, type Me } from "@/lib/connection-rank"
import { extractHashtags } from "@/lib/rules"
import { RETENTION } from "@/lib/legal"

const DAY = 24 * 60 * 60 * 1000
// How many people are gathered from each source before ranking. Bounded so a busy account stays quick.
const POOL = 200
const POST_POOL = 400
const INTEREST_MS = 30 * DAY
const MAX_TOPICS = 30
const MAX_LANGUAGES = 12

export type Onboarding = "pending" | "done" | "skipped"

export type Settings = {
  country: string
  countryName: string | null
  area: string
  suggestNearby: boolean
  suggestLanguage: boolean
  speak: { code: string; level: SpeakLevel }[]
  learn: string[]
  onboarding: Onboarding
}

type SettingsRow = {
  country: string
  area: string
  suggest_nearby: number
  suggest_language: number
  onboarding: string
}

function onboardingOf(value: string): Onboarding {
  return value === "pending" || value === "done" ? value : "skipped"
}

export function settingsFor(userId: string): Settings {
  const row = get<SettingsRow>(
    "SELECT country, area, suggest_nearby, suggest_language, onboarding FROM users WHERE id = ?",
    userId
  )
  const languages = all<{ code: string; kind: string; level: string }>(
    "SELECT code, kind, level FROM user_languages WHERE user_id = ? ORDER BY rowid",
    userId
  )
  return {
    country: row?.country ?? "",
    countryName: row?.country ? countryName(row.country) : null,
    area: row?.area ?? "",
    suggestNearby: (row?.suggest_nearby ?? 1) === 1,
    suggestLanguage: (row?.suggest_language ?? 1) === 1,
    speak: languages
      .filter((language) => language.kind === "speak")
      .map((language) => ({ code: language.code, level: language.level as SpeakLevel })),
    learn: languages.filter((language) => language.kind === "learn").map((language) => language.code),
    onboarding: onboardingOf(row?.onboarding ?? "skipped"),
  }
}

// Saves where someone is. The caller has checked the country and the area. An empty area clears it, and the nearby
// switch then has nothing to match on.
export function saveWhere(userId: string, where: { country: string; area: string; suggestNearby: boolean }): void {
  const area = cleanArea(where.area)
  run(
    "UPDATE users SET country = ?, area = ?, area_key = ?, suggest_nearby = ? WHERE id = ?",
    area === "" ? "" : where.country,
    area,
    area === "" ? "" : areaKey(area),
    where.suggestNearby ? 1 : 0,
    userId
  )
}

// Saves the languages someone speaks (with a level) and is learning, and the language-partner switch. A language is
// never both: one learned language that is also spoken is dropped from the learning list.
export function saveLanguages(
  userId: string,
  languages: { speak: { code: string; level: SpeakLevel }[]; learn: string[]; suggestLanguage: boolean }
): void {
  const speak = languages.speak.slice(0, MAX_LANGUAGES)
  const spoken = new Set(speak.map((language) => language.code))
  const learn = [...new Set(languages.learn)].filter((code) => !spoken.has(code)).slice(0, MAX_LANGUAGES)
  transaction(() => {
    run("DELETE FROM user_languages WHERE user_id = ?", userId)
    for (const language of speak) {
      run("INSERT INTO user_languages (user_id, code, kind, level) VALUES (?, ?, 'speak', ?)", userId, language.code, language.level)
    }
    for (const code of learn) {
      run("INSERT INTO user_languages (user_id, code, kind, level) VALUES (?, ?, 'learn', '')", userId, code)
    }
    run("UPDATE users SET suggest_language = ? WHERE id = ?", languages.suggestLanguage ? 1 : 0, userId)
  })
}

export function setOnboarding(userId: string, value: "done" | "skipped"): void {
  run("UPDATE users SET onboarding = ? WHERE id = ?", value, userId)
}

// "Not now" on a suggestion: that person is not suggested to this viewer again.
export function dismissConnection(viewerId: string, userId: string): void {
  run("INSERT OR IGNORE INTO connection_dismissals (viewer_id, user_id, created_at) VALUES (?, ?, ?)", viewerId, userId, Date.now())
}

export function dismissedCount(viewerId: string): number {
  return get<{ n: number }>("SELECT COUNT(*) AS n FROM connection_dismissals WHERE viewer_id = ?", viewerId)?.n ?? 0
}

export function clearDismissals(viewerId: string): void {
  run("DELETE FROM connection_dismissals WHERE viewer_id = ?", viewerId)
}

// Dismissals older than the retention period are removed by the background tick.
export function purgeDismissals(now: number): void {
  run("DELETE FROM connection_dismissals WHERE created_at < ?", now - RETENTION.dismissedConnectionsDays * DAY)
}

export type SuggestedPerson = {
  id: string
  handle: string
  name: string
  avatarFile: string | null
  verified: boolean
  bio: string
  group: Group
  // Why this person is here, most useful first. The card shows the first two.
  reasons: string[]
}

export type SuggestionGroup = {
  group: Group
  title: string
  description: string
  people: SuggestedPerson[]
}

export type Suggestions = {
  // What the viewer has filled in. Groups that need a missing part are empty, and the page says what to add.
  hasArea: boolean
  hasLanguages: boolean
  groups: SuggestionGroup[]
}

// The conditions every suggested person must pass. The viewer's own id goes in six times, in the order of the "?" marks.
const EXCLUDED = `u.id <> ? AND u.protected = 0 AND u.deactivated_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = ? AND f.followee_id = u.id)
  AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = ? AND b.blocked_id = u.id) OR (b.blocker_id = u.id AND b.blocked_id = ?))
  AND NOT EXISTS (SELECT 1 FROM mutes m WHERE m.muter_id = ? AND m.muted_id = u.id)
  AND NOT EXISTS (SELECT 1 FROM connection_dismissals d WHERE d.viewer_id = ? AND d.user_id = u.id)`

const LIVE = "p.is_draft = 0 AND p.publish_at IS NULL AND p.removed_at IS NULL"

function excludedParams(viewerId: string): string[] {
  return [viewerId, viewerId, viewerId, viewerId, viewerId, viewerId]
}

type CandidateRow = {
  id: string
  handle: string
  name: string
  avatar_file: string | null
  verified: number
  bio: string
  followers_count: number
  country: string
  area_key: string
  suggest_nearby: number
  suggest_language: number
  active_at: number | null
}

// The suggestions for a viewer. When nothing matches yet, the last group holds people to start with: the accounts most
// people follow. They are never matched to anyone, and their card says so, so a new account always has people to look at.
export function suggestionsFor(viewerId: string, now: number, perGroup = 6): Suggestions {
  const matched = matchedFor(viewerId, now, perGroup)
  if (matched.groups.some((group) => group.group !== "starting" && group.people.length > 0)) return matched
  const starting = startingPeople(viewerId, perGroup)
  return {
    ...matched,
    groups: matched.groups.map((group) => (group.group === "starting" ? { ...group, people: starting } : group)),
  }
}

// One empty group for each kind of match, then the group for people to start with.
function emptyGroups(): SuggestionGroup[] {
  return [...GROUP_ORDER, "starting" as const].map((group) => ({ group, ...GROUP_TEXT[group], people: [] }))
}

type StartingRow = {
  id: string
  handle: string
  name: string
  avatar_file: string | null
  verified: number
  bio: string
  followers_count: number
}

// The accounts most people follow, for a viewer with no matches. The same rules as every suggestion apply.
function startingPeople(viewerId: string, count: number): SuggestedPerson[] {
  return all<StartingRow>(
    `SELECT u.id, u.handle, u.name, u.avatar_file, u.verified, u.bio, u.followers_count
     FROM users u
     WHERE ${EXCLUDED}
     ORDER BY u.followers_count DESC, u.created_at DESC
     LIMIT ?`,
    ...excludedParams(viewerId),
    count
  ).map(
    (row): SuggestedPerson => ({
      id: row.id,
      handle: row.handle,
      name: row.name,
      avatarFile: row.avatar_file,
      verified: row.verified === 1,
      bio: row.bio,
      group: "starting",
      reasons: [row.followers_count > 0 ? `Followed by ${row.followers_count} ${row.followers_count === 1 ? "person" : "people"}` : "New to Rhenko"],
    })
  )
}

function matchedFor(viewerId: string, now: number, perGroup: number): Suggestions {
  const viewer = get<{ country: string; area: string; area_key: string; suggest_nearby: number; suggest_language: number }>(
    "SELECT country, area, area_key, suggest_nearby, suggest_language FROM users WHERE id = ?",
    viewerId
  )
  const empty: Suggestions = {
    hasArea: false,
    hasLanguages: false,
    groups: emptyGroups(),
  }
  if (!viewer) return empty

  const languageRows = all<{ code: string; kind: string }>("SELECT code, kind FROM user_languages WHERE user_id = ?", viewerId)
  const languageOn = viewer.suggest_language === 1
  const speaks = languageOn ? languageRows.filter((row) => row.kind === "speak").map((row) => row.code) : []
  const learns = languageOn ? languageRows.filter((row) => row.kind === "learn").map((row) => row.code) : []
  const hasArea = viewer.country !== "" && viewer.area_key !== ""
  const nearbyOn = hasArea && viewer.suggest_nearby === 1
  const topics = all<{ tag: string }>(
    "SELECT tag FROM topic_follows WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
    viewerId,
    MAX_TOPICS
  ).map((row) => row.tag)

  const me: Me = { speaks, learns, area: nearbyOn ? cleanArea(viewer.area) : null, topics }
  const pool = new Set<string>()

  // Where people share a city or town. Only people who have turned nearby suggestions on.
  if (nearbyOn) {
    for (const row of all<{ id: string }>(
      "SELECT u.id FROM users u WHERE u.country = ? AND u.area_key = ? AND u.suggest_nearby = 1 AND u.id <> ? ORDER BY u.followers_count DESC LIMIT ?",
      viewer.country,
      viewer.area_key,
      viewerId,
      POOL
    )) {
      pool.add(row.id)
    }
  }

  // Languages: someone who speaks a language you are learning, or who is learning one you speak. Only people who have
  // turned language suggestions on.
  if (languageOn && (speaks.length > 0 || learns.length > 0)) {
    for (const row of all<{ id: string }>(
      `SELECT DISTINCT ul.user_id AS id FROM user_languages ul JOIN users u ON u.id = ul.user_id
       WHERE u.suggest_language = 1 AND u.id <> ? AND (
         (ul.kind = 'speak' AND ul.code IN (SELECT value FROM json_each(?)))
         OR (ul.kind = 'learn' AND ul.code IN (SELECT value FROM json_each(?)))
       ) LIMIT ?`,
      viewerId,
      JSON.stringify([...new Set([...speaks, ...learns])]),
      JSON.stringify(speaks),
      POOL
    )) {
      pool.add(row.id)
    }
  }

  // Followed by people you follow: how many of your follows follow this person. Deactivated and blocked accounts in
  // between do not count.
  const mutual = new Map<string, number>()
  for (const row of all<{ id: string; n: number }>(
    `SELECT f2.followee_id AS id, COUNT(*) AS n
     FROM follows f1
     JOIN follows f2 ON f2.follower_id = f1.followee_id
     JOIN users friend ON friend.id = f1.followee_id
     WHERE f1.follower_id = ? AND f2.followee_id <> ? AND friend.deactivated_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = ? AND b.blocked_id = friend.id) OR (b.blocker_id = friend.id AND b.blocked_id = ?))
     GROUP BY f2.followee_id ORDER BY n DESC LIMIT ?`,
    viewerId,
    viewerId,
    viewerId,
    viewerId,
    POOL
  )) {
    mutual.set(row.id, row.n)
    pool.add(row.id)
  }

  // Writes about your topics: people who posted a topic you follow in the last 30 days. The tag is checked exactly,
  // the way the topic pages check it, after a quick search over the text.
  const topicsOf = new Map<string, Set<string>>()
  if (topics.length > 0) {
    const wanted = new Set(topics)
    const clauses = topics.map(() => "instr(lower(p.body), ?) > 0").join(" OR ")
    for (const row of all<{ author_id: string; body: string }>(
      `SELECT p.author_id, p.body FROM posts p
       WHERE p.created_at >= ? AND ${LIVE} AND p.author_id <> ? AND (${clauses})
         AND NOT EXISTS (SELECT 1 FROM communities c WHERE c.id = p.community_id AND c.access = 'closed')
       ORDER BY p.created_at DESC LIMIT ?`,
      now - INTEREST_MS,
      viewerId,
      ...topics.map((tag) => `#${tag}`),
      POST_POOL
    )) {
      const matched = extractHashtags(row.body).filter((tag) => wanted.has(tag))
      if (matched.length === 0) continue
      const set = topicsOf.get(row.author_id) ?? new Set<string>()
      for (const tag of matched) set.add(tag)
      topicsOf.set(row.author_id, set)
      pool.add(row.author_id)
    }
  }

  if (pool.size === 0) return { ...empty, hasArea, hasLanguages: languageRows.length > 0 }

  const people = all<CandidateRow>(
    `SELECT u.id, u.handle, u.name, u.avatar_file, u.verified, u.bio, u.followers_count, u.country, u.area_key,
       u.suggest_nearby, u.suggest_language,
       (SELECT MAX(p.created_at) FROM posts p WHERE p.author_id = u.id AND ${LIVE}) AS active_at
     FROM users u
     WHERE u.id IN (SELECT value FROM json_each(?)) AND ${EXCLUDED}`,
    JSON.stringify([...pool]),
    ...excludedParams(viewerId)
  )
  if (people.length === 0) return { ...empty, hasArea, hasLanguages: languageRows.length > 0 }

  const languagesOf = new Map<string, { speaks: string[]; learns: string[] }>()
  for (const row of all<{ user_id: string; code: string; kind: string }>(
    "SELECT user_id, code, kind FROM user_languages WHERE user_id IN (SELECT value FROM json_each(?))",
    JSON.stringify(people.map((person) => person.id))
  )) {
    const entry = languagesOf.get(row.user_id) ?? { speaks: [], learns: [] }
    if (row.kind === "speak") entry.speaks.push(row.code)
    else entry.learns.push(row.code)
    languagesOf.set(row.user_id, entry)
  }

  const candidates: Candidate[] = people.map((person) => {
    const theirs = person.suggest_language === 1 ? languagesOf.get(person.id) : undefined
    return {
      id: person.id,
      sameArea: nearbyOn && person.suggest_nearby === 1 && person.country === viewer.country && person.area_key === viewer.area_key,
      speaks: theirs?.speaks ?? [],
      learns: theirs?.learns ?? [],
      mutual: mutual.get(person.id) ?? 0,
      mutualHandles: [],
      topics: [...(topicsOf.get(person.id) ?? [])],
      followers: person.followers_count,
      activeAt: person.active_at,
    }
  })
  const byId = new Map(people.map((person) => [person.id, person] as const))
  const ranked = rankConnections(me, candidates, now)

  const groups: SuggestionGroup[] = GROUP_ORDER.map((group) => {
    const picks = (ranked.get(group) ?? []).slice(0, perGroup)
    const shown = picks.map((item) => {
      const person = byId.get(item.candidate.id)
      if (!person) throw new Error(`a suggested person went missing: ${item.candidate.id}`)
      const withFriends: Candidate = { ...item.candidate, mutualHandles: item.candidate.mutual > 0 ? mutualHandlesOf(viewerId, person.id) : [] }
      return {
        id: person.id,
        handle: person.handle,
        name: person.name,
        avatarFile: person.avatar_file,
        verified: person.verified === 1,
        bio: person.bio,
        group,
        reasons: reasonsOf(me, withFriends, item.facts, (code) => languageName(code) ?? code),
      }
    })
    return { group, ...GROUP_TEXT[group], people: shown }
  })

  return { hasArea, hasLanguages: languageRows.length > 0, groups: [...groups, { group: "starting", ...GROUP_TEXT.starting, people: [] }] }
}

// The names of up to three people the viewer follows who also follow this person, most followed first.
function mutualHandlesOf(viewerId: string, personId: string): string[] {
  return all<{ handle: string }>(
    `SELECT friend.handle FROM follows f1
     JOIN follows f2 ON f2.follower_id = f1.followee_id
     JOIN users friend ON friend.id = f1.followee_id
     WHERE f1.follower_id = ? AND f2.followee_id = ? AND friend.deactivated_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = ? AND b.blocked_id = friend.id) OR (b.blocker_id = friend.id AND b.blocked_id = ?))
     ORDER BY friend.followers_count DESC LIMIT 3`,
    viewerId,
    personId,
    viewerId,
    viewerId
  ).map((row) => row.handle)
}

// The first few people across the groups, in group order, for the setup steps and the side panel.
export function topPeople(suggestions: Suggestions, count: number): SuggestedPerson[] {
  const out: SuggestedPerson[] = []
  for (const group of suggestions.groups) {
    for (const person of group.people) {
      if (out.length >= count) return out
      out.push(person)
    }
  }
  return out
}
