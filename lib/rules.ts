// Shared rules. Pure functions only, so client components can import them.

export const MAX_POST = 280
export const MAX_BIO = 160
export const MAX_NAME = 50
export const MAX_LOCATION = 30
export const MAX_WEBSITE = 100
export const MAX_DM = 1000
export const MIN_PASSWORD = 8
export const MAX_PASSWORD = 200
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024

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

export function countChars(text: string): number {
  return [...text].length
}

export function validateHandle(handle: string): string | null {
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

export function validatePost(body: string, hasMedia: boolean): string | null {
  const length = countChars(body)
  if (length > MAX_POST) return `Posts can have up to ${MAX_POST} characters.`
  if (length === 0 && !hasMedia) return "Write something or add an image."
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
