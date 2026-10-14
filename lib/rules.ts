// Shared rules. Pure functions only, so client components can import them.

// Long posts are free here: X keeps 25,000 characters for paying accounts.
export const MAX_POST = 25000
// An article is a post with a title and a longer body. Its body is limited separately, and it can't be a reply, a quote,
// a poll or part of a thread.
export const MAX_ARTICLE = 50000
export const MAX_TITLE = 120
export const MAX_BIO = 160
export const MAX_NAME = 50
export const MAX_LOCATION = 30
export const MAX_WEBSITE = 100
export const MAX_DM = 1000
export const MIN_PASSWORD = 8
export const MAX_PASSWORD = 200

// Profiles live at /<handle>, so a handle must never take the name of a top-level route. These lists follow the route
// tree: each folder directly under app/(app), app/(auth), app/api and app/media, the app's own top-level routes, and
// the pages the app links to. A new top-level route folder goes into its list here in the same change.
const ROUTES_APP = ["advertise", "analytics", "bookmarks", "connect", "drafts", "explore", "lists", "messages", "notices", "notifications", "search", "settings", "topics"]
const ROUTES_AUTH = ["login", "signup", "forgot-password", "reset-password", "welcome"]
const ROUTES_API = ["api", "account-data", "calls", "events", "feed", "health", "suggest"]
const ROUTES_ROOT = [
  "media", "offline", "terms", "privacy", "rules", "safety", "copyright", "transparency", "legal", "notice", "accept-terms", "manifest", "favicon",
]
// Words kept back for paths the app uses or would read as its own.
const RESERVED_WORDS = ["logout", "status", "kit", "home", "compose", "admin", "rhenko", "sahayak"]

export const RESERVED_HANDLES: ReadonlySet<string> = new Set([...ROUTES_APP, ...ROUTES_AUTH, ...ROUTES_API, ...ROUTES_ROOT, ...RESERVED_WORDS])

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

export function validatePost(body: string, mediaCount: number, hasPoll: boolean, article = false): string | null {
  const length = countChars(body)
  if (article) {
    if (length > MAX_ARTICLE) return `Articles can have up to ${MAX_ARTICLE} characters.`
  } else if (length > MAX_POST) return `Posts can have up to ${MAX_POST} characters.`
  if (length === 0 && mediaCount === 0 && !hasPoll) return "Write something, or add media or a poll."
  return null
}

// A title is one line of plain text. An empty title means an ordinary post.
export function cleanTitle(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

export function validateTitle(title: string): string | null {
  if ([...title].length > MAX_TITLE) return `Titles can have up to ${MAX_TITLE} characters.`
  return null
}

// Mentions and hashtags, read the same way the post text is drawn (components/app/post-body.tsx). Links are skipped
// whole, and a mark that sits right after a letter, digit or one of @ # . / is part of something else (an address,
// a URL path, "item#2"), so it is not counted. Handles and tags compare case-insensitively.
export const MENTION_PATTERN = /@([A-Za-z0-9_]{3,15})(?![A-Za-z0-9_])/g
const TAG_PATTERN = /#([\p{L}\p{N}_]{1,50})(?![\p{L}\p{N}_])/gu
const JOINED_BEFORE = /[\p{L}\p{N}_@#./]/u

function plainMarks(body: string, pattern: RegExp): string[] {
  const text = body.replace(/https?:\/\/\S+/g, " ")
  const found = new Set<string>()
  for (const match of text.matchAll(pattern)) {
    const at = match.index ?? 0
    if (at > 0 && JOINED_BEFORE.test(text[at - 1])) continue
    found.add(match[1].toLowerCase())
  }
  return [...found]
}

export function extractMentions(body: string): string[] {
  return plainMarks(body, MENTION_PATTERN)
}

export function extractHashtags(body: string): string[] {
  return plainMarks(body, TAG_PATTERN)
}

// Media, polls, scheduling and the other post features.
export const MAX_IMAGES = 4
export const MAX_VIDEOS = 1
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024
// A video can run for up to 140 seconds, the length X allows, and up to 100 MB. The composer checks the length when a
// video is picked, because the server does not decode video.
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024
export const MAX_VIDEO_SECONDS = 140
export const MAX_ALT = 1000
// A voice message is recorded for up to two minutes. Opus at a voice bitrate keeps that far under the size limit.
export const MAX_VOICE_SECONDS = 120
export const MAX_VOICE_BYTES = 10 * 1024 * 1024
export const POLL_MIN_OPTIONS = 2
export const POLL_MAX_OPTIONS = 4
export const MAX_POLL_OPTION = 25
// Poll lengths in minutes: 5 minutes, 30 minutes, 1, 6, 24, 72 hours, 7 days.
export const POLL_DURATIONS = [5, 30, 60, 360, 1440, 4320, 10080] as const
// Posts can be edited for an hour. Plus extends that to a day. Replies can be edited for five minutes, for everyone, so a
// reply can be fixed soon after it goes out. Only the edit window differs, never reach or ranking.
export const EDIT_WINDOW_MS = 60 * 60 * 1000
export const PLUS_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000
export const REPLY_EDIT_WINDOW_MS = 5 * 60 * 1000
export function editWindowMs(plus: boolean, reply = false): number {
  if (reply) return REPLY_EDIT_WINDOW_MS
  return plus ? PLUS_EDIT_WINDOW_MS : EDIT_WINDOW_MS
}
export const SCHEDULE_MIN_LEAD_MS = 5 * 60 * 1000
export const SCHEDULE_MAX_AHEAD_MS = 75 * 24 * 60 * 60 * 1000

export const REPLY_SETTINGS = ["everyone", "following", "mentioned"] as const
export type ReplySetting = (typeof REPLY_SETTINGS)[number]

export function asReplySetting(value: string | null | undefined): ReplySetting {
  return (REPLY_SETTINGS as readonly string[]).includes(value ?? "") ? (value as ReplySetting) : "everyone"
}

// Who may reply to a post under its reply setting, read the way the composer offers it: "Accounts you follow" means
// accounts the post's author follows. The author can always reply, and so can the account the post answers, so two
// people can keep a conversation going. Visibility and blocks are checked separately.
export function replyAllowed(
  setting: ReplySetting,
  viewer: { isAuthor: boolean; isAnswered: boolean; followedByAuthor: boolean; mentioned: boolean }
): boolean {
  if (viewer.isAuthor || viewer.isAnswered) return true
  if (setting === "following") return viewer.followedByAuthor
  if (setting === "mentioned") return viewer.mentioned
  return true
}

// Why a reply was refused under a post's reply setting.
export function replyRefusal(setting: ReplySetting): string {
  if (setting === "following") return "Only accounts the author follows can reply."
  if (setting === "mentioned") return "Only accounts mentioned in this post can reply."
  return "You can't reply to this post."
}

// What every action says when its post is missing, unpublished, or hidden from the person acting.
export const POST_UNAVAILABLE = "That post isn't available."

// The reasons on a post's report menu. The intimate-image reason hides the post at once and sends it to priority review.
export const REPORT_REASONS = ["Spam", "Abusive or harmful", "Misleading", "Intimate image without consent", "Illegal content", "Something else"] as const

export const REACTIONS = ["❤️", "😂", "😮", "😢", "👍", "🔥"] as const

export const MAX_LIST_NAME = 25
export const MAX_LIST_DESCRIPTION = 100

// Circles. The charter is the circle's own rules, shown before anyone joins.
export const MAX_CIRCLE_NAME = 50
export const MAX_CIRCLE_TAGLINE = 120
export const MAX_CIRCLE_CHARTER = 1000
export const MAX_CIRCLE_QUESTION = 160
export const MAX_CIRCLE_ANSWER = 500
export const CIRCLE_ACCESS = ["open", "request", "closed"] as const
export type CircleAccess = (typeof CIRCLE_ACCESS)[number]

export function asCircleAccess(value: unknown): CircleAccess | null {
  return (CIRCLE_ACCESS as readonly unknown[]).includes(value) ? (value as CircleAccess) : null
}
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
export const SAVED_SEARCH_LIMIT = 25
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
// Notifications load this many at a time; "Show more" brings the next page.
export const NOTIFICATION_PAGE_SIZE = 40

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

// Passkeys and security keys an account can keep, and the longest name a key can have.
export const MAX_PASSKEYS = 10
export const MAX_PASSKEY_NAME = 40
