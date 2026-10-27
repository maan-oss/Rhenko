// Rules for topics and for paging through people. Pure functions, constants and types only, so client components can import them.
import type { UserCard } from "@/lib/data"

// A topic is a hashtag or a cashtag. A post's #tag holds letters, numbers and underscores, 1 to 50 characters, and a
// $CASHTAG holds 1 to 10 letters (lib/rules.ts), so a followed topic can only be one of those. Anything else could never
// match a post.
export const MAX_TOPIC = 50

// How many topics one person can follow. It keeps the Following feed and the table small.
export const MAX_FOLLOWED_TOPICS = 200

// People are listed this many at a time, then "Show more" asks for the next page.
export const PEOPLE_PAGE = 30

const TOPIC_PATTERN = /^[\p{L}\p{N}_]+$/u
// The letters after the $ of a cashtag. Kept here, not imported, so this file stays free of runtime imports; it matches
// CASHTAG_PATTERN in lib/rules.ts.
const CASHTAG_SYMBOL = /^[A-Za-z]{1,10}$/

export type TopicCheck = { ok: true; tag: string } | { ok: false; error: string }

// The tag as the app stores it, or the reason it can't be a topic. A hashtag has no leading # and is lower case ("aapl").
// A cashtag keeps its $ and is upper case ("$AAPL"), so it is never the same topic as the hashtag with the same letters.
export function checkTopic(raw: unknown): TopicCheck {
  if (typeof raw !== "string") return { ok: false, error: "Pick a topic." }
  const trimmed = raw.trim()
  if (trimmed.startsWith("$")) {
    const symbol = trimmed.slice(1)
    if (!CASHTAG_SYMBOL.test(symbol)) return { ok: false, error: "Cashtags are a $ and 1 to 10 letters." }
    return { ok: true, tag: `$${symbol.toUpperCase()}` }
  }
  const tag = trimmed.replace(/^#/, "").toLowerCase()
  if (!tag) return { ok: false, error: "Pick a topic." }
  if ([...tag].length > MAX_TOPIC) return { ok: false, error: `Topics can have up to ${MAX_TOPIC} characters.` }
  if (!TOPIC_PATTERN.test(tag)) return { ok: false, error: "Topics use letters, numbers and underscores only." }
  return { ok: true, tag }
}

// A topic from a link. The router may hand it over still percent-encoded, so decode it once when it looks encoded.
export function topicFromParam(param: string): TopicCheck {
  let value = param
  if (value.includes("%")) {
    try {
      value = decodeURIComponent(value)
    } catch {
      return { ok: false, error: "That topic link isn't valid." }
    }
  }
  return checkTopic(value)
}

// A person in a followers or following list: their card, and whether the viewer has asked to follow them and is waiting.
export type PersonEntry = UserCard & { requested: boolean }

// The SQL that keeps posts with a muted word out of the feeds, search, topic pages and reply threads (lib/data.ts), with
// its values in order. Posts are alias p. A muted word or phrase matches anywhere in a post's text or an article's title,
// ignoring case, and a %, _ or \ in it matches only itself. No words, no SQL.
export function mutedWordFilter(words: readonly string[]): { sql: string; params: string[] } {
  const clauses: string[] = []
  const params: string[] = []
  for (const word of words) {
    const pattern = `%${word.toLowerCase().replace(/[\\%_]/g, (m) => `\\${m}`)}%`
    clauses.push("AND lower(p.body) NOT ILIKE ? ESCAPE '\\' AND lower(p.title) NOT ILIKE ? ESCAPE '\\'")
    params.push(pattern, pattern)
  }
  return { sql: clauses.join(" "), params }
}
