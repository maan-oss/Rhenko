import { randomUUID } from "node:crypto"
import { MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, MAX_VIDEO_SECONDS, MAX_VOICE_BYTES } from "@/lib/rules"
import { stripImageMetadata } from "@/lib/image-metadata"
import { objectSize, readObject, removeObjects, storeObject } from "@/lib/storage"
import { trimProblem, type Trim } from "@/lib/trim-rules"
import { VideoRefused, withCleanVideo, type VideoCut } from "@/lib/video-metadata"

// Upload rules and picture copies. The bytes live in storage (lib/storage.ts). Each file gets a random name, and a viewer
// is sent a link to it only after the media route has checked that they may see it.

export { storeObject }

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

const VIDEO_MB = MAX_VIDEO_BYTES / (1024 * 1024)

// The size of an upload, or null when it is missing.
export async function uploadSize(name: string): Promise<number | null> {
  if (!UPLOAD_NAME_PATTERN.test(name)) return null
  return await objectSize(name)
}

// A whole upload, or null when it is missing.
export async function readUpload(name: string): Promise<Buffer | null> {
  if (!UPLOAD_NAME_PATTERN.test(name)) return null
  return await readObject(name)
}

// Removes an upload with its smaller copies. A file that is already gone is not an error.
export async function removeUpload(name: string | null | undefined): Promise<void> {
  if (!name || !UPLOAD_NAME_PATTERN.test(name)) return
  await removeObjects([name, ...VARIANT_WIDTHS.map((width) => variantName(name, width))])
}

// Returns null when no file was chosen. Names are random, so a name never points at two different files. `accept`
// restricts what a field may hold: "any" is a post's photos and video, "audio" is a voice message, and "image" is an
// avatar or a chat photo. A `trim` keeps only that part of a video. It is stored as an MP4, whatever the upload was, and
// the post carries nothing of the rest. The window is checked here against the length of the real file.
export async function saveUpload(
  value: FormDataEntryValue | null,
  accept: "image" | "audio" | "any" = "any",
  trim: Trim | null = null
): Promise<SaveResult | null> {
  if (!(value instanceof File) || value.size === 0) return null
  // A recorder can label its type with codecs ("audio/webm;codecs=opus"). The codecs are not part of the format.
  const type = value.type.split(";")[0].trim()
  const format = FORMATS[type]
  if (!format) return { ok: false, error: "Use a JPEG, PNG, WebP or GIF image, or an MP4, WebM or MOV video." }
  if (accept === "image" && format.kind !== "image") return { ok: false, error: "Use a JPEG, PNG, WebP or GIF image." }
  if (accept === "audio" && format.kind !== "audio") return { ok: false, error: "Send a voice recording." }
  if (accept === "any" && format.kind === "audio") return { ok: false, error: "Use a JPEG, PNG, WebP or GIF image, or an MP4, WebM or MOV video." }
  if (trim && format.kind !== "video") return { ok: false, error: "Only a video can be trimmed." }
  const limit = format.kind === "video" ? MAX_VIDEO_BYTES : format.kind === "audio" ? MAX_VOICE_BYTES : MAX_IMAGE_BYTES
  if (value.size > limit) {
    return {
      ok: false,
      error: format.kind === "video" ? `Videos can be up to ${VIDEO_MB} MB.` : format.kind === "audio" ? "Voice messages are too long." : "Images can be up to 4 MB.",
    }
  }

  let body: Uint8Array | null = null
  if (format.kind === "video") {
    // A video is checked from its first bytes. It is cleaned and stored below, from disk, so no second copy of it is held in memory.
    const head = Buffer.from(await value.slice(0, 16).arrayBuffer())
    if (!matchesSignature(head, type)) return { ok: false, error: "That file is not a valid video." }
  } else {
    let buf: Buffer
    try {
      buf = Buffer.from(await value.arrayBuffer())
    } catch {
      return { ok: false, error: "That file didn't finish uploading. Try again." }
    }
    if (!matchesSignature(buf, type)) {
      const problem = format.kind === "audio" ? "That file is not a valid recording." : "That file is not a valid image."
      return { ok: false, error: problem }
    }
    // A photo keeps its picture only. Location, camera and time details are removed before anything is stored.
    if (format.kind === "image") {
      const clean = stripImageMetadata(buf, type)
      if (!clean) return { ok: false, error: "That file is not a valid image." }
      buf = clean
    }
    body = new Uint8Array(buf)
  }

  // A trimmed video is cut and encoded again as an MP4, so it is stored as one.
  const stored = trim ? FORMATS["video/mp4"] : format
  const cut: VideoCut | null = trim
    ? {
        ...trim,
        maxSeconds: MAX_VIDEO_SECONDS,
        maxBytes: MAX_VIDEO_BYTES,
        check: (duration) => trimProblem(trim, MAX_VIDEO_SECONDS, duration),
      }
    : null
  const name = `${randomUUID().replace(/-/g, "")}.${stored.ext}`
  try {
    if (body !== null) await storeObject(name, body, type)
    // A video keeps its picture and sound only. Location, device and time details are removed before anything is stored,
    // and a video that cannot be cleaned is refused. The original is never kept.
    else await withCleanVideo(value, type, (clean) => storeObject(name, clean, stored.mime), cut, MAX_VIDEO_SECONDS)
  } catch (error) {
    // A video that could not be cleaned was refused before anything reached storage.
    if (error instanceof VideoRefused) return { ok: false, error: error.message }
    // A write that fails part way leaves nothing behind.
    await removeUpload(name)
    console.error("[uploads] saving a file failed", error)
    return { ok: false, error: "That file couldn't be saved. Try again." }
  }
  // A picture gets its feed-sized copy now, so the first person to see it does not wait for the copy to be made.
  if (format.kind === "image") await variantFile(name, FEED_WIDTH)
  return { ok: true, name, kind: format.kind }
}

// ── Smaller copies ──────────────────────────────────────────────────────────────────────────────────────────────────

// Smaller copies of a picture. A feed photo, a profile picture or a link preview is sent at the width its place on the page
// needs, not at the size it was uploaded. A copy is made the first time someone asks for that width and kept beside the
// original, so the cost is paid once. A copy is always WebP. Animated GIFs, video and voice messages are sent as they are.
export const VARIANT_WIDTHS = [160, 640, 1280] as const
export type VariantWidth = (typeof VARIANT_WIDTHS)[number]
// The width a feed, a link preview or a chat photo asks for: sharp on a phone or a 2x screen.
export const FEED_WIDTH: VariantWidth = 1280

const VARIANT_EXTS = new Set(["jpg", "png", "webp"])

export function variantWidthOf(value: string | null): VariantWidth | null {
  const width = Number(value)
  return (VARIANT_WIDTHS as readonly number[]).includes(width) ? (width as VariantWidth) : null
}

function variantName(name: string, width: VariantWidth): string {
  const base = name.slice(0, name.lastIndexOf("."))
  return `variants/${base}.w${width}.webp`
}

// The stored name of a picture at this width, made now if it does not exist yet. Null means send the original: the file
// is not a picture that can be resized, or the copy could not be made.
export async function variantFile(name: string, width: VariantWidth): Promise<string | null> {
  if (!UPLOAD_NAME_PATTERN.test(name)) return null
  if (!VARIANT_EXTS.has(name.slice(name.lastIndexOf(".") + 1))) return null
  const target = variantName(name, width)
  if ((await objectSize(target)) !== null) return target
  try {
    const original = await readObject(name)
    if (!original) return null
    const { default: sharp } = await import("sharp")
    const out = await sharp(original).resize({ width, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer()
    await storeObject(target, new Uint8Array(out), "image/webp")
    return target
  } catch (error) {
    console.error("[uploads] making a smaller copy failed", error)
    return null
  }
}

export function contentTypeFor(name: string): string {
  const ext = name.slice(name.lastIndexOf(".") + 1)
  return BY_EXT[ext]?.mime ?? "application/octet-stream"
}
