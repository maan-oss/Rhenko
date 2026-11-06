// The text of an exported chat: one line per message, oldest first, the way a chat export is read. Pure, so the layout can be
// checked without a database (tests/chat-export.test.mjs). Photos, videos and voice notes are not in the file, only a line that
// says they were there, and a file keeps its name.

// Types only: erased when the file runs, so the module still needs no imports and the test suite can load it alone.
import type { SealedAttachmentView } from "@/lib/e2ee-chat"
import type { SearchableMessage } from "@/lib/chat-message-rules"

// One message as the export needs it. The data layer fills it from what the viewer can see, so a message they can't see never
// reaches this text.
export type ExportMessage = {
  createdAt: number
  senderName: string
  body: string
  editedAt: number | null
  deleted: boolean
  viewOnce: boolean
  hasMedia: boolean
  attachment:
    | { kind: "document"; name: string }
    | { kind: "scan" }
    | { kind: "contact"; name: string | null }
    | { kind: "location"; lat: number; lng: number }
    | { kind: "poll"; question: string; options: string[] }
    | null
  // The outcome of a call that ended, was missed or was declined. Null for any other message.
  callOutcome: string | null
  // A change to the disappearing-messages timer: the new value in milliseconds, 0 for off. Null for any other message.
  timerChange: number | null
}

// What the server holds for an encrypted message that the export needs to read it on the device: the envelope, this viewer's wrap and
// the stored name of the ciphertext file. Null for any other message.
export type SealedRef = { envelope: string; wrap: { epk: string; iv: string; key: string } | null; file: string | null }

// A message as the chat's export gets it: the export's own fields, the id, whether the viewer sent it, and the sealed reference.
export type ExportRow = ExportMessage & { id: string; mine: boolean; sealed: SealedRef | null }

// "2026-10-27 14:05:09", in UTC. The export says so in its header, because the server does not know the viewer's time zone.
function stampOf(at: number): string {
  const iso = new Date(at).toISOString()
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)}`
}

// What a message reads as in the export. Media is named, not included.
export function exportContent(message: ExportMessage): string {
  if (message.deleted) return "This message was deleted."
  if (message.callOutcome !== null) return `Call (${message.callOutcome}).`
  if (message.timerChange !== null) {
    return message.timerChange > 0 ? "Disappearing messages turned on." : "Disappearing messages turned off."
  }
  const parts: string[] = []
  if (message.viewOnce) parts.push("<view-once photo or video omitted>")
  else if (message.hasMedia) parts.push(message.attachment?.kind === "document" ? `<file: ${message.attachment.name}>` : "<media omitted>")
  const attachment = message.attachment
  if (attachment?.kind === "contact") parts.push(`<contact card: ${attachment.name ?? "unavailable"}>`)
  if (attachment?.kind === "location") parts.push(`<location: ${attachment.lat}, ${attachment.lng}>`)
  if (attachment?.kind === "poll") parts.push(`Poll: ${attachment.question} (${attachment.options.join(" / ")})`)
  if (message.body) parts.push(message.body)
  const text = parts.join(" ")
  return message.editedAt !== null ? `${text} (edited)` : text
}

// The whole file. `truncated` is set when older messages were left out, so the file says so instead of looking complete.
export function chatExportText(title: string, messages: ExportMessage[], truncated: boolean, generatedAt: number): string {
  const header = [
    `Chat with ${title || "no name"}`,
    `Exported ${stampOf(generatedAt)} UTC from Rhenko.`,
    "Times are in UTC. Photos, videos and voice notes are listed, not included. Files keep their names.",
  ]
  if (truncated) header.push("This export holds the most recent messages only. Older messages are not included.")
  const lines = messages.map((message) => `[${stampOf(message.createdAt)}] ${message.senderName}: ${exportContent(message)}`)
  return `${[...header, "", ...lines].join("\n")}\n`
}

// How many chats one person may export in an hour, from the server or from the device.
export const EXPORTS_PER_HOUR = 5
export const EXPORT_WINDOW_MS = 60 * 60 * 1000

// A file name for the download: the date, so exports from different days don't collide.
export function exportFileName(generatedAt: number): string {
  return `rhenko-chat-${new Date(generatedAt).toISOString().slice(0, 10)}.txt`
}

// What the export says for an encrypted message this device could not read.
export const UNREADABLE_IN_EXPORT = "<encrypted message, not readable on this device>"

// What a device made of an encrypted message when it opened it: its words and attachment, or why it could not be opened.
export type OpenedText = { ok: true; text: string; attachment: SealedAttachmentView | null } | { ok: false; error: string }

// A message as the export reads it on the device. A plain message is exported as the server gives it. An encrypted one takes its words
// and attachment from what this device opened, and reads as a note when it can't open it (sent before this device was linked, say).
export function exportedMessage(row: ExportRow, opened: OpenedText | undefined): ExportMessage {
  const plain: ExportMessage = {
    createdAt: row.createdAt,
    senderName: row.senderName,
    body: row.body,
    editedAt: row.editedAt,
    deleted: row.deleted,
    viewOnce: row.viewOnce,
    hasMedia: row.hasMedia,
    attachment: row.attachment,
    callOutcome: row.callOutcome,
    timerChange: row.timerChange,
  }
  if (row.sealed === null) return plain
  if (!opened || !opened.ok) return { ...plain, body: UNREADABLE_IN_EXPORT, hasMedia: false, viewOnce: false, attachment: null }
  const media = opened.attachment?.kind === "media" ? opened.attachment.media : null
  return {
    ...plain,
    body: opened.text,
    hasMedia: media !== null,
    viewOnce: media?.viewOnce ?? false,
    attachment: attachmentOf(opened.attachment),
  }
}

// The export's attachment line for what an encrypted message carries. A photo, voice note or audio file is listed by its presence only.
function attachmentOf(view: SealedAttachmentView | null): ExportMessage["attachment"] {
  if (!view) return null
  if (view.kind === "media") return view.media.media === "document" ? { kind: "document", name: view.media.name } : null
  if (view.kind === "location") return { kind: "location", lat: view.lat, lng: view.lng }
  if (view.kind === "contact") return { kind: "contact", name: view.user?.name ?? null }
  return { kind: "poll", question: view.question, options: view.options.map((option) => option.label) }
}

// The words a message holds for a search made on the device, once they are known. Null for a message with no words to search.
export function searchableOf(row: ExportRow, opened: OpenedText | undefined): SearchableMessage | null {
  const text = row.sealed === null ? row.body : opened?.ok ? opened.text : ""
  if (row.deleted || text.trim() === "") return null
  return { id: row.id, senderName: row.senderName, mine: row.mine, createdAt: row.createdAt, text }
}
