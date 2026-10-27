import { isAudioFile, isDocumentFile, isVideoFile, isVoiceFile } from "@/lib/media-names"

// What a chat message carries besides its text. A photo, video, audio file or voice note is stored as a media file, and
// needs no extra detail. The other kinds are kept as JSON in chat_messages.attachment: a document's name and size, a scan
// (a photo that was framed and cleaned up as a page), a contact (another Rhenko account) and a location. Parsing is strict,
// so anything the server did not write is ignored rather than shown.

export type Attachment =
  | { kind: "document"; name: string; size: number }
  | { kind: "scan" }
  | { kind: "contact"; userId: string }
  | { kind: "location"; lat: number; lng: number }

const MAX_NAME = 120

// A file name a reader can see: no folders, no control characters, and a short length.
export function cleanFileName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? ""
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, "").trim()
  const chars = [...clean]
  if (chars.length === 0) return "File"
  return chars.length <= MAX_NAME ? clean : chars.slice(0, MAX_NAME).join("")
}

export function parseAttachment(text: string | null | undefined): Attachment | null {
  if (!text) return null
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return null
  }
  if (!value || typeof value !== "object") return null
  const v = value as Record<string, unknown>
  if (v.kind === "document") {
    if (typeof v.name !== "string" || typeof v.size !== "number" || !Number.isFinite(v.size) || v.size < 0) return null
    return { kind: "document", name: cleanFileName(v.name), size: v.size }
  }
  if (v.kind === "scan") return { kind: "scan" }
  if (v.kind === "contact") {
    return typeof v.userId === "string" && v.userId.length > 0 && v.userId.length <= 64 ? { kind: "contact", userId: v.userId } : null
  }
  if (v.kind === "location") {
    if (typeof v.lat !== "number" || typeof v.lng !== "number") return null
    if (!Number.isFinite(v.lat) || !Number.isFinite(v.lng) || Math.abs(v.lat) > 90 || Math.abs(v.lng) > 180) return null
    return { kind: "location", lat: v.lat, lng: v.lng }
  }
  return null
}

export function attachmentText(attachment: Attachment): string {
  return JSON.stringify(attachment)
}

// The line a conversation list, a push or a digest shows for a message that carries something other than its text.
// Null for a plain text message.
export function attachmentPreview(attachment: Attachment | null, mediaFile: string | null): string | null {
  if (attachment?.kind === "contact") return "Shared a contact"
  if (attachment?.kind === "location") return "Shared a location"
  if (attachment?.kind === "document") return "Sent a file"
  if (attachment?.kind === "scan") return "Sent a scan"
  if (!mediaFile) return null
  if (isVoiceFile(mediaFile)) return "Sent a voice message"
  if (isAudioFile(mediaFile)) return "Sent an audio file"
  if (isVideoFile(mediaFile)) return "Sent a video"
  if (isDocumentFile(mediaFile)) return "Sent a file"
  return "Sent a photo"
}

// A file size as a reader expects it: 800 B, 12 KB, 4.2 MB.
export function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  const mb = bytes / (1024 * 1024)
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`
}

// The short name a quote shows for a message: its text, or the kind of thing it carries.
export function quoteLabel(attachment: Attachment | null, media: string | null, hasPost: boolean): string {
  if (attachment?.kind === "contact") return "Contact"
  if (attachment?.kind === "location") return "Location"
  if (attachment?.kind === "scan") return "Scan"
  if (attachment?.kind === "document") return "File"
  if (media) return mediaLabel(media)
  if (hasPost) return "Shared a post"
  return "Message"
}

// A short name for a stored media file, for a quote: a voice message, a photo, a video, audio or a file.
export function mediaLabel(media: string): string {
  if (isVoiceFile(media)) return "Voice message"
  if (isAudioFile(media)) return "Audio"
  if (isVideoFile(media)) return "Video"
  if (isDocumentFile(media)) return "File"
  return "Photo"
}

// The file extension of a stored media name, for a download's name and type.
export function extensionOf(name: string): string {
  return name.slice(name.lastIndexOf(".") + 1).toLowerCase()
}
