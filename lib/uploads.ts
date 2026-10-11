import { randomUUID } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { MAX_UPLOAD_BYTES } from "@/lib/rules"
import { UPLOAD_DIR } from "@/lib/db"

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
}

export const UPLOAD_NAME_PATTERN = /^[a-f0-9]{32}\.(jpg|png|webp|gif)$/

function matchesSignature(buf: Buffer, mime: string): boolean {
  if (mime === "image/jpeg") return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff
  if (mime === "image/png") return buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  if (mime === "image/gif") return buf.subarray(0, 3).toString("ascii") === "GIF"
  if (mime === "image/webp") {
    return buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP"
  }
  return false
}

export type SaveResult = { ok: true; name: string } | { ok: false; error: string }

// Returns null when no file was chosen. Files are named by a hash of their
// content plus a random id, so a name never points at two different images.
export async function saveUpload(value: FormDataEntryValue | null): Promise<SaveResult | null> {
  if (!(value instanceof File) || value.size === 0) return null
  if (value.size > MAX_UPLOAD_BYTES) return { ok: false, error: "Images can be up to 4 MB." }
  const ext = EXTENSIONS[value.type]
  if (!ext) return { ok: false, error: "Use a JPEG, PNG, WebP or GIF image." }
  const buf = Buffer.from(await value.arrayBuffer())
  if (!matchesSignature(buf, value.type)) {
    return { ok: false, error: "That file is not a valid image." }
  }
  const name = `${randomUUID().replace(/-/g, "")}.${ext}`
  fs.mkdirSync(UPLOAD_DIR, { recursive: true })
  await fs.promises.writeFile(path.join(/*turbopackIgnore: true*/ UPLOAD_DIR, name), buf)
  return { ok: true, name }
}

export function removeUpload(name: string | null): void {
  if (!name || !UPLOAD_NAME_PATTERN.test(name)) return
  fs.promises.unlink(path.join(/*turbopackIgnore: true*/ UPLOAD_DIR, name)).catch(() => undefined)
}

export function uploadPath(name: string): string | null {
  if (!UPLOAD_NAME_PATTERN.test(name)) return null
  return path.join(/*turbopackIgnore: true*/ UPLOAD_DIR, name)
}

export function contentTypeFor(name: string): string {
  if (name.endsWith(".png")) return "image/png"
  if (name.endsWith(".webp")) return "image/webp"
  if (name.endsWith(".gif")) return "image/gif"
  return "image/jpeg"
}
