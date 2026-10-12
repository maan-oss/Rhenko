import { randomUUID } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, MAX_VOICE_BYTES } from "@/lib/rules"
import { UPLOAD_DIR } from "@/lib/db"
import { stripImageMetadata } from "@/lib/image-metadata"

export type MediaKind = "image" | "video" | "audio"

type Format = { ext: string; kind: MediaKind; mime: string }

const FORMATS: Record<string, Format> = {
  "image/jpeg": { ext: "jpg", kind: "image", mime: "image/jpeg" },
  "image/png": { ext: "png", kind: "image", mime: "image/png" },
  "image/webp": { ext: "webp", kind: "image", mime: "image/webp" },
  "image/gif": { ext: "gif", kind: "image", mime: "image/gif" },
  "video/mp4": { ext: "mp4", kind: "video", mime: "video/mp4" },
  "video/webm": { ext: "webm", kind: "video", mime: "video/webm" },
  "video/quicktime": { ext: "mov", kind: "video", mime: "video/quicktime" },
  // Voice messages. The browser records WebM/Opus or MP4/AAC, and Ogg where it is the only option.
  "audio/webm": { ext: "weba", kind: "audio", mime: "audio/webm" },
  "audio/mp4": { ext: "m4a", kind: "audio", mime: "audio/mp4" },
  "audio/ogg": { ext: "oga", kind: "audio", mime: "audio/ogg" },
}

const BY_EXT: Record<string, Format> = Object.fromEntries(Object.values(FORMATS).map((f) => [f.ext, f]))

export const UPLOAD_NAME_PATTERN = /^[a-f0-9]{32}\.(jpg|png|webp|gif|mp4|webm|mov|weba|m4a|oga)$/

export function mediaKindOf(name: string): MediaKind {
  const ext = name.slice(name.lastIndexOf(".") + 1)
  return BY_EXT[ext]?.kind ?? "image"
}

function matchesSignature(buf: Buffer, mime: string): boolean {
  if (mime === "image/jpeg") return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff
  if (mime === "image/png") return buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  if (mime === "image/gif") return buf.subarray(0, 3).toString("ascii") === "GIF"
  if (mime === "image/webp") {
    return buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP"
  }
  if (mime === "video/mp4" || mime === "video/quicktime") {
    return buf.subarray(4, 8).toString("ascii") === "ftyp"
  }
  if (mime === "video/webm" || mime === "audio/webm") return buf.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
  if (mime === "audio/mp4") return buf.subarray(4, 8).toString("ascii") === "ftyp"
  if (mime === "audio/ogg") return buf.subarray(0, 4).toString("ascii") === "OggS"
  return false
}

export type SaveResult = { ok: true; name: string; kind: MediaKind } | { ok: false; error: string }

// Returns null when no file was chosen. Names are random, so a name never
// points at two different files. `accept` restricts what a field may hold: "any" is a post's photos and video,
// "audio" is a voice message, and "image" is an avatar or a chat photo.
export async function saveUpload(
  value: FormDataEntryValue | null,
  accept: "image" | "audio" | "any" = "any"
): Promise<SaveResult | null> {
  if (!(value instanceof File) || value.size === 0) return null
  // A recorder can label its type with codecs ("audio/webm;codecs=opus"). The codecs are not part of the format.
  const type = value.type.split(";")[0].trim()
  const format = FORMATS[type]
  if (!format) return { ok: false, error: "Use a JPEG, PNG, WebP or GIF image, or an MP4, WebM or MOV video." }
  if (accept === "image" && format.kind !== "image") return { ok: false, error: "Use a JPEG, PNG, WebP or GIF image." }
  if (accept === "audio" && format.kind !== "audio") return { ok: false, error: "Send a voice recording." }
  if (accept === "any" && format.kind === "audio") return { ok: false, error: "Use a JPEG, PNG, WebP or GIF image, or an MP4, WebM or MOV video." }
  const limit = format.kind === "video" ? MAX_VIDEO_BYTES : format.kind === "audio" ? MAX_VOICE_BYTES : MAX_IMAGE_BYTES
  if (value.size > limit) {
    return {
      ok: false,
      error: format.kind === "video" ? "Videos can be up to 25 MB." : format.kind === "audio" ? "Voice messages are too long." : "Images can be up to 4 MB.",
    }
  }
  let buf: Buffer
  try {
    buf = Buffer.from(await value.arrayBuffer())
  } catch {
    return { ok: false, error: "That file didn't finish uploading. Try again." }
  }
  if (!matchesSignature(buf, type)) {
    const problem = format.kind === "video" ? "That file is not a valid video." : format.kind === "audio" ? "That file is not a valid recording." : "That file is not a valid image."
    return { ok: false, error: problem }
  }
  // A photo keeps its picture only. Location, camera and time details are removed before anything is stored.
  if (format.kind === "image") {
    const clean = stripImageMetadata(buf, type)
    if (!clean) return { ok: false, error: "That file is not a valid image." }
    buf = clean
  }
  const name = `${randomUUID().replace(/-/g, "")}.${format.ext}`
  const target = path.join(/*turbopackIgnore: true*/ UPLOAD_DIR, name)
  try {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true })
    await fs.promises.writeFile(target, buf)
  } catch (error) {
    // A write that fails part way leaves nothing behind.
    await fs.promises.unlink(target).catch(() => undefined)
    console.error("[uploads] saving a file failed", error)
    return { ok: false, error: "That file couldn't be saved. Try again." }
  }
  return { ok: true, name, kind: format.kind }
}

export function removeUpload(name: string | null | undefined): void {
  if (!name || !UPLOAD_NAME_PATTERN.test(name)) return
  fs.promises.unlink(path.join(/*turbopackIgnore: true*/ UPLOAD_DIR, name)).catch(() => undefined)
}

export function uploadPath(name: string): string | null {
  if (!UPLOAD_NAME_PATTERN.test(name)) return null
  return path.join(/*turbopackIgnore: true*/ UPLOAD_DIR, name)
}

export function contentTypeFor(name: string): string {
  const ext = name.slice(name.lastIndexOf(".") + 1)
  return BY_EXT[ext]?.mime ?? "application/octet-stream"
}
