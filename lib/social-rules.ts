// Rules for topics and for paging through people. Pure functions, constants and types only, so client components can import them.
import type { UserCard } from "@/lib/data"

// A topic is a hashtag. A post's #tag holds letters, numbers and underscores, 1 to 50 characters, so a followed topic
// can only be one of those. Anything else could never match a post.
export const MAX_TOPIC = 50

// How many topics one person can follow. It keeps the Following feed and the table small.
export const MAX_FOLLOWED_TOPICS = 200

// People are listed this many at a time, then "Show more" asks for the next page.
export const PEOPLE_PAGE = 30

const TOPIC_PATTERN = /^[\p{L}\p{N}_]+$/u

export type TopicCheck = { ok: true; tag: string } | { ok: false; error: string }

// The tag as the app stores it (no leading #, lower case), or the reason it can't be a topic.
export function checkTopic(raw: unknown): TopicCheck {
  if (typeof raw !== "string") return { ok: false, error: "Pick a topic." }
  const tag = raw.trim().replace(/^#/, "").toLowerCase()
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
