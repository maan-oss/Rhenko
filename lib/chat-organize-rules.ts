// Rules for organising chats: how many chats a person may pin, which messages may be forwarded, and what a forward names. Pure
// functions only, so the limits can be checked without a database (tests/chat-organize-rules.test.mjs).

// The most chats one person can pin to the top of their list, as in WhatsApp.
export const PINNED_CHATS_MAX = 3

// The most chats one forward can go to at once.
export const FORWARD_TARGETS_MAX = 5

// A message as the forwarding check needs it: what it is, not what it says.
export type ForwardCandidate = {
  deleted: boolean
  callStatus: string | null
  timerChange: number | null
  attachmentKind: string | null
  viewOnce: boolean
}

// Why a message can't be forwarded, or null when it can. A poll is left out: its votes belong to the original, so a copy would
// start with none, which would look like a different poll. A view-once photo is left out too, so it can't be passed on to be seen
// again.
export function forwardRefusal(message: ForwardCandidate): string | null {
  if (message.deleted) return "That message was deleted, so it can't be forwarded."
  if (message.callStatus !== null) return "A call record can't be forwarded."
  if (message.timerChange !== null) return "A change to disappearing messages can't be forwarded."
  if (message.attachmentKind === "poll") return "A poll can't be forwarded. Make a new one in the chat you want it in."
  if (message.viewOnce) return "A view-once photo can't be forwarded."
  return null
}

// The chats a forward goes to: one to five distinct ids. Anything else is refused with a reason a person can act on.
export function forwardTargetsInput(raw: unknown): { ok: true; ids: string[] } | { ok: false; error: string } {
  if (!Array.isArray(raw) || raw.some((id) => typeof id !== "string" || id.length === 0 || id.length > 64)) {
    return { ok: false, error: "Choose the chats to forward to." }
  }
  const ids = [...new Set(raw as string[])]
  if (ids.length === 0) return { ok: false, error: "Choose at least one chat." }
  if (ids.length > FORWARD_TARGETS_MAX) return { ok: false, error: `You can forward to up to ${FORWARD_TARGETS_MAX} chats at once.` }
  return { ok: true, ids }
}
