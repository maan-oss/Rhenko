// Linking a browser to an account that already has devices. A new browser asks for a link and shows a six-digit code. A device the
// account already trusts approves that code. Then the approving device copies the account's message keys to the new one, so it can
// read the history as well as what comes after. This module has no imports, so the test suite can run its rules on their own
// (tests/e2ee-link.test.mjs). The server and the browser both use it.

// The error a browser gets when it sets itself up while the account already has devices: it must be linked from one of them.
export const LINK_REQUIRED = "LINK_REQUIRED"

// A link waits this long for an approval. An approved link stays open this long, so the history can be copied to it.
export const LINK_WAIT_MS = 5 * 60 * 1000
export const LINK_COPY_MS = 10 * 60 * 1000

// Links one person may have waiting at once.
export const LINK_PENDING_MAX = 3

// Message keys copied in one request. A browser copies its history in as many requests as it takes.
export const HISTORY_BATCH_MAX = 200

// The code a new browser shows: six digits. It is read from the screen and typed on the approving device, or checked by eye.
export const LINK_CODE_DIGITS = 6

// Tidies what was typed for a code: spaces and dashes are dropped, so "123 456" and "123-456" are the same code. Refused unless six digits.
export function linkCodeInput(raw: unknown): { ok: true; code: string } | { ok: false; error: string } {
  if (typeof raw !== "string") return { ok: false, error: "Enter the six-digit code." }
  const code = raw.replace(/[\s-]/g, "")
  if (!new RegExp(`^\\d{${LINK_CODE_DIGITS}}$`).test(code)) return { ok: false, error: "Enter the six-digit code." }
  return { ok: true, code }
}

// The code as people read it: two groups of three, "123 456".
export function formatLinkCode(code: string): string {
  return code.length === LINK_CODE_DIGITS ? `${code.slice(0, 3)} ${code.slice(3)}` : code
}

// One message's key, copied to a device: the message it is for, and the wrap for the new device.
export type CopiedWrap = { messageId: string; epk: string; iv: string; key: string }

const ID_MAX = 64
const PART_MAX = 512

// Checks a batch of copied keys before they are stored. Each must name a message and carry three base64 parts of a sane size.
export function historyWrapsInput(raw: unknown): { ok: true; wraps: CopiedWrap[] } | { ok: false; error: string } {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > HISTORY_BATCH_MAX) {
    return { ok: false, error: `Copy between 1 and ${HISTORY_BATCH_MAX} messages at a time.` }
  }
  const wraps: CopiedWrap[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") return { ok: false, error: "That copy of a message isn't valid." }
    const { messageId, epk, iv, key } = item as Record<string, unknown>
    if (typeof messageId !== "string" || messageId.length === 0 || messageId.length > ID_MAX) {
      return { ok: false, error: "That copy of a message isn't valid." }
    }
    for (const part of [epk, iv, key]) {
      if (typeof part !== "string" || part.length === 0 || part.length > PART_MAX || !/^[A-Za-z0-9+/=_-]+$/.test(part)) {
        return { ok: false, error: "That copy of a message isn't valid." }
      }
    }
    wraps.push({ messageId, epk: epk as string, iv: iv as string, key: key as string })
  }
  return { ok: true, wraps }
}

// Where the copy continues from: the id of the last message the approving device sent a copy of, or the start.
export function historyCursorInput(raw: unknown): { ok: true; after: string } | { ok: false; error: string } {
  if (raw === undefined || raw === null || raw === "") return { ok: true, after: "" }
  if (typeof raw !== "string" || raw.length > ID_MAX) return { ok: false, error: "That position isn't valid." }
  return { ok: true, after: raw }
}
