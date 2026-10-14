import { randomUUID } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { Readable } from "node:stream"
import type { ReadableStream as WebReadableStream } from "node:stream/web"
import { pipeline } from "node:stream/promises"
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

async function saveVideo(value: File, type: string, format: Format): Promise<SaveResult> {
  const head = Buffer.from(await value.slice(0, 16).arrayBuffer())
  if (!matchesSignature(head, type)) return { ok: false, error: "That file is not a valid video." }
  const name = `${randomUUID().replace(/-/g, "")}.${format.ext}`
  const target = path.join(/*turbopackIgnore: true*/ UPLOAD_DIR, name)
  try {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true })
    await pipeline(Readable.fromWeb(value.stream() as unknown as WebReadableStream), fs.createWriteStream(target))
  } catch (error) {
    // A write that fails part way leaves nothing behind.
    await fs.promises.unlink(target).catch(() => undefined)
    console.error("[uploads] saving a file failed", error)
    return { ok: false, error: "That file couldn't be saved. Try again." }
  }
  return { ok: true, name, kind: format.kind }
}

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
      error: format.kind === "video" ? `Videos can be up to ${VIDEO_MB} MB.` : format.kind === "audio" ? "Voice messages are too long." : "Images can be up to 4 MB.",
    }
  }
  // A video is checked from its first bytes and then streamed to disk, so a long clip is never held in memory whole.
  if (format.kind === "video") return saveVideo(value, type, format)
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
  // A picture gets its feed-sized copy now, so the first person to see it does not wait for the copy to be made.
  if (format.kind === "image") await variantFile(name, FEED_WIDTH)
  return { ok: true, name, kind: format.kind }
}

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

function variantPath(name: string, width: VariantWidth): string {
  const base = name.slice(0, name.lastIndexOf("."))
  return path.join(/*turbopackIgnore: true*/ UPLOAD_DIR, "variants", `${base}.w${width}.webp`)
}

// The file to send for a picture at this width, made now if it does not exist yet. Null means send the original: the
// file is not a picture that can be resized, or the copy could not be made.
export async function variantFile(name: string, width: VariantWidth): Promise<string | null> {
  if (!UPLOAD_NAME_PATTERN.test(name)) return null
  if (!VARIANT_EXTS.has(name.slice(name.lastIndexOf(".") + 1))) return null
  const target = variantPath(name, width)
  try {
    await fs.promises.access(target)
    return target
  } catch {
    // Not made yet.
  }
  const source = path.join(/*turbopackIgnore: true*/ UPLOAD_DIR, name)
  // Written under a temporary name and renamed when whole, so a reader never gets half a picture.
  const temp = `${target}.${randomUUID()}.tmp`
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true })
    const { default: sharp } = await import("sharp")
    await sharp(source).resize({ width, withoutEnlargement: true }).webp({ quality: 80 }).toFile(temp)
    await fs.promises.rename(temp, target)
    return target
  } catch (error) {
    await fs.promises.unlink(temp).catch(() => undefined)
    console.error("[uploads] making a smaller copy failed", error)
    return null
  }
}

export function removeUpload(name: string | null | undefined): void {
  if (!name || !UPLOAD_NAME_PATTERN.test(name)) return
  fs.promises.unlink(path.join(/*turbopackIgnore: true*/ UPLOAD_DIR, name)).catch(() => undefined)
  for (const width of VARIANT_WIDTHS) fs.promises.unlink(variantPath(name, width)).catch(() => undefined)
}

export function uploadPath(name: string): string | null {
  if (!UPLOAD_NAME_PATTERN.test(name)) return null
  return path.join(/*turbopackIgnore: true*/ UPLOAD_DIR, name)
}

export function contentTypeFor(name: string): string {
  const ext = name.slice(name.lastIndexOf(".") + 1)
  return BY_EXT[ext]?.mime ?? "application/octet-stream"
}
