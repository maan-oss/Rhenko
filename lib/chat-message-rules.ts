// Rules for the messages of a chat: when a sent message can still be edited, what a view-once photo or video needs, what a
// search may ask for, and how a search hit is shown. Pure functions only, so the limits can be checked without a database
// (tests/chat-message-rules.test.mjs).

// A sender can change a message's words for this long after sending it, as WhatsApp allows.
export const EDIT_WINDOW_MS = 15 * 60 * 1000

// The longest search a person can type.
export const SEARCH_QUERY_MAX = 100

// A message as the edit check needs it: whose it is, what it is, and when it was sent.
export type EditCandidate = {
  mine: boolean
  deleted: boolean
  callStatus: string | null
  timerChange: number | null
  attachmentKind: string | null
  viewOnce: boolean
  createdAt: number
}

// Why a message can't be edited, or null when it can. Only the words of a message or its caption change. A poll, a contact or a
// place is what it is, and its votes or card belong to it, so those are left as sent.
export function editRefusal(message: EditCandidate, now: number): string | null {
  if (!message.mine) return "Only the sender can edit a message."
  if (message.deleted) return "That message was deleted, so it can't be edited."
  if (message.callStatus !== null) return "A call record can't be edited."
  if (message.timerChange !== null) return "A change to disappearing messages can't be edited."
  if (message.attachmentKind === "poll" || message.attachmentKind === "contact" || message.attachmentKind === "location") {
    return "Only the words of a message can be edited."
  }
  if (message.viewOnce) return "A view-once photo can't be edited."
  if (now - message.createdAt > EDIT_WINDOW_MS) return "Messages can only be edited for 15 minutes after they're sent."
  return null
}

// The new words of an edited message: trimmed, with line breaks kept. A message with no photo or video needs some words, and no
// message can be longer than the limit the chat allows.
export function editBodyInput(raw: unknown, hasMedia: boolean, maxChars: number): { ok: true; body: string } | { ok: false; error: string } {
  if (typeof raw !== "string") return { ok: false, error: "Write the message again." }
  const body = raw.replace(/\r\n/g, "\n").trim()
  if (body.length === 0 && !hasMedia) return { ok: false, error: "Write a message." }
  if ([...body].length > maxChars) return { ok: false, error: `Messages can have up to ${maxChars} characters.` }
  return { ok: true, body }
}

// A view-once message is one photo or video, with an optional caption. A scan, a file or anything else can't be sent that way.
export function viewOnceRefusal(options: { requested: boolean; hasPhoto: boolean; scan: boolean }): string | null {
  if (!options.requested) return null
  if (options.scan) return "A scan can't be sent to be seen once."
  if (!options.hasPhoto) return "Only a photo or video can be sent to be seen once."
  return null
}

// A search: the words a person typed, with the spaces tidied. Empty or too long is refused with a reason.
export function searchQueryInput(raw: unknown): { ok: true; query: string } | { ok: false; error: string } {
  if (typeof raw !== "string") return { ok: false, error: "Type something to search for." }
  const query = raw.replace(/\s+/g, " ").trim()
  if (query.length === 0) return { ok: false, error: "Type something to search for." }
  if ([...query].length > SEARCH_QUERY_MAX) return { ok: false, error: `Searches can have up to ${SEARCH_QUERY_MAX} characters.` }
  return { ok: true, query }
}

// The part of a message a search hit shows: a short run of words around the first match, with the match itself marked by its
// position so the list can light it. Text that can't be matched cleanly by position falls back to the start of the message.
export function snippetAround(body: string, query: string, context = 48): { before: string; match: string; after: string } {
  const flat = body.replace(/\s+/g, " ").trim()
  const lower = flat.toLowerCase()
  const needle = query.toLowerCase()
  const at = needle.length > 0 ? lower.indexOf(needle) : -1
  if (at < 0 || lower.length !== flat.length) {
    const head = [...flat].slice(0, context * 2).join("")
    return { before: "", match: "", after: head + (head.length < flat.length ? "…" : "") }
  }
  const start = Math.max(0, at - context)
  const end = Math.min(flat.length, at + needle.length + context)
  const before = (start > 0 ? "…" : "") + flat.slice(start, at)
  const after = flat.slice(at + needle.length, end) + (end < flat.length ? "…" : "")
  return { before, match: flat.slice(at, at + needle.length), after }
}

// The handles a message mentions with "@", lowercased and each once. A mention is a handle that starts a word, so an address or a
// link's path (x@y, /@handle) doesn't count. The same rule decides how the text is shown (components/app/post-body.tsx).
const MENTION_WORD = /(?<![\p{L}\p{N}_@#./])@([A-Za-z0-9_]{3,15})(?![A-Za-z0-9_])/gu
export function mentionedHandles(body: string): string[] {
  const found = new Set<string>()
  for (const match of body.matchAll(MENTION_WORD)) found.add(match[1].toLowerCase())
  return [...found]
}

// The start of a day picked in a date field ("2026-10-27"), in the time zone of the device that picked it. Null for anything that
// isn't a real date, such as February 30.
export function dayStartOf(value: unknown): number | null {
  if (typeof value !== "string") return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
  return date.getTime()
}
