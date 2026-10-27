// The text of an exported chat: one line per message, oldest first, the way a chat export is read. Pure, so the layout can be
// checked without a database (tests/chat-export.test.mjs). Photos, videos and voice notes are not in the file, only a line that
// says they were there, and a file keeps its name.

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

// A file name for the download: the date, so exports from different days don't collide.
export function exportFileName(generatedAt: number): string {
  return `rhenko-chat-${new Date(generatedAt).toISOString().slice(0, 10)}.txt`
}
