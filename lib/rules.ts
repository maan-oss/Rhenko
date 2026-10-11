// Shared rules. Pure functions only, so client components can import them.

export const MAX_POST = 280
export const MAX_BIO = 160
export const MAX_NAME = 50
export const MAX_LOCATION = 30
export const MAX_WEBSITE = 100
export const MAX_DM = 1000
export const MIN_PASSWORD = 8
export const MAX_PASSWORD = 200

export const RESERVED_HANDLES = new Set([
  "login",
  "signup",
  "logout",
  "explore",
  "notifications",
  "messages",
  "bookmarks",
  "settings",
  "status",
  "media",
  "kit",
  "api",
  "home",
  "search",
  "compose",
  "admin",
  "rhenko",
])

export const HANDLE_PATTERN = /^[A-Za-z0-9_]{3,15}$/
export const HANDLE_MIN = 3
export const HANDLE_MAX = 15
export const HANDLE_MAX_UNDERSCORES = 5
export const HANDLE_MIN_LETTERS = 3

export function countChars(text: string): number {
  return [...text].length
}

// The first problem with a handle as typed (without the @), or null when it is valid.
// The signup form shows this live in red, and the server runs the same check.
export function handleProblem(handle: string): string | null {
  if (handle.length === 0) return null
  if (!/^[A-Za-z0-9_]*$/.test(handle)) return "Use only letters, numbers and underscores."
  if (handle.length < HANDLE_MIN) return `At least ${HANDLE_MIN} characters.`
  if (handle.length > HANDLE_MAX) return `No more than ${HANDLE_MAX} characters.`
  if ((handle.match(/_/g) ?? []).length > HANDLE_MAX_UNDERSCORES) return `Up to ${HANDLE_MAX_UNDERSCORES} underscores.`
  if ((handle.match(/[A-Za-z]/g) ?? []).length < HANDLE_MIN_LETTERS) return `At least ${HANDLE_MIN_LETTERS} letters.`
  return null
}

export function validateHandle(handle: string): string | null {
  const problem = handleProblem(handle)
  if (problem) return problem
  if (!HANDLE_PATTERN.test(handle)) {
    return "Handles use 3 to 15 letters, numbers or underscores."
  }
  if (RESERVED_HANDLES.has(handle.toLowerCase())) {
    return "That handle is reserved. Pick another."
  }
  return null
}

export function validateName(name: string): string | null {
  if (name.length < 1) return "Add a display name."
  if (countChars(name) > MAX_NAME) return `Names can have up to ${MAX_NAME} characters.`
  return null
}

export function validateWebsite(url: string): string | null {
  if (url === "") return null
  if (url.length > MAX_WEBSITE) return `Websites can have up to ${MAX_WEBSITE} characters.`
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return "Website must start with http:// or https://."
    }
  } catch {
    return "Enter a valid website address."
  }
  return null
}

export function validatePost(body: string, mediaCount: number, hasPoll: boolean): string | null {
  const length = countChars(body)
  if (length > MAX_POST) return `Posts can have up to ${MAX_POST} characters.`
  if (length === 0 && mediaCount === 0 && !hasPoll) return "Write something, or add media or a poll."
  return null
}

// Mentions and hashtags. Used for rendering and for
// mention notifications. Handles are compared case-insensitively.
export const MENTION_PATTERN = /@([A-Za-z0-9_]{3,15})/g

export function extractMentions(body: string): string[] {
  const found = new Set<string>()
  for (const match of body.matchAll(MENTION_PATTERN)) {
    found.add(match[1].toLowerCase())
  }
  return [...found]
}

export function extractHashtags(body: string): string[] {
  const found = new Set<string>()
  for (const match of body.matchAll(/#([\p{L}\p{N}_]{1,50})/gu)) {
    found.add(match[1].toLowerCase())
  }
  return [...found]
}

// Media, polls, scheduling and the other post features.
export const MAX_IMAGES = 4
export const MAX_VIDEOS = 1
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024
export const MAX_VIDEO_BYTES = 25 * 1024 * 1024
export const MAX_ALT = 1000
export const POLL_MIN_OPTIONS = 2
export const POLL_MAX_OPTIONS = 4
export const MAX_POLL_OPTION = 25
// Poll lengths in minutes: 5 minutes, 30 minutes, 1, 6, 24, 72 hours, 7 days.
export const POLL_DURATIONS = [5, 30, 60, 360, 1440, 4320, 10080] as const
export const EDIT_WINDOW_MS = 30 * 60 * 1000
export const SCHEDULE_MIN_LEAD_MS = 5 * 60 * 1000
export const SCHEDULE_MAX_AHEAD_MS = 75 * 24 * 60 * 60 * 1000

export const REPLY_SETTINGS = ["everyone", "following", "mentioned"] as const
export type ReplySetting = (typeof REPLY_SETTINGS)[number]

export const REPLY_SETTING_LABELS: Record<ReplySetting, string> = {
  everyone: "Everyone",
  following: "Accounts you follow",
  mentioned: "Only accounts you mention",
}

export const REPORT_REASONS = ["Spam", "Abusive or harmful", "Misleading", "Something else"] as const

export const REACTIONS = ["❤️", "😂", "😮", "😢", "👍", "🔥"] as const

export const MAX_LIST_NAME = 25
export const MAX_LIST_DESCRIPTION = 100
export const MAX_MUTED_WORD = 50
export const MAX_GROUP_TITLE = 50
export const MAX_GROUP_MEMBERS = 50
export const MAX_FOLDER_NAME = 25
export const MAX_HIGHLIGHTS = 50
export const MAX_NOTE = 280
// A community note is shown to everyone once this many people rate it helpful,
// and helpful ratings outnumber unhelpful ones.
export const NOTE_SHOW_MIN_HELPFUL = 2
// The author can undo a new post for this long after it goes out.
export const UNDO_WINDOW_MS = 10 * 1000
export const RECENT_SEARCH_LIMIT = 15
export const MAX_SEARCH_LENGTH = 300
// A profile visit from the same person counts once per window.
export const PROFILE_VISIT_WINDOW_MS = 6 * 60 * 60 * 1000
// A call rings this long before it counts as unanswered.
export const CALL_RING_MS = 35 * 1000
// Limits on what a call can relay: one session description, one network candidate.
export const CALL_SDP_MAX = 30_000
export const CALL_CANDIDATE_MAX = 1_000
// How much of a message a banner shows.
export const BANNER_PREVIEW_MAX = 140

export function validatePoll(options: string[], minutes: number): string | null {
  if (options.length < POLL_MIN_OPTIONS || options.length > POLL_MAX_OPTIONS) {
    return `Polls need ${POLL_MIN_OPTIONS} to ${POLL_MAX_OPTIONS} choices.`
  }
  if (options.some((option) => countChars(option) > MAX_POLL_OPTION)) {
    return `Poll choices can have up to ${MAX_POLL_OPTION} characters.`
  }
  if (!(POLL_DURATIONS as readonly number[]).includes(minutes)) return "Pick a poll length."
  return null
}

export function validateSchedule(at: number, now: number): string | null {
  if (!Number.isFinite(at)) return "Pick a valid time."
  if (at < now + SCHEDULE_MIN_LEAD_MS) return "Schedule at least 5 minutes ahead."
  if (at > now + SCHEDULE_MAX_AHEAD_MS) return "Schedule up to 75 days ahead."
  return null
}

export function normalizeTag(tag: string): string {
  return tag.replace(/^#/, "").toLowerCase()
}

export function normalizeWord(word: string): string {
  return word.trim().replace(/^#/, "").toLowerCase()
}

// Age is checked against the date given, so a 13th birthday today counts.
export function ageFrom(birthday: string, now = new Date()): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthday)
  if (!match) return null
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  let age = now.getUTCFullYear() - year
  const beforeBirthday =
    now.getUTCMonth() + 1 < month || (now.getUTCMonth() + 1 === month && now.getUTCDate() < day)
  if (beforeBirthday) age -= 1
  return age
}
