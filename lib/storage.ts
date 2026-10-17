import fs from "node:fs"
import path from "node:path"
import { Readable } from "node:stream"
import type { ReadableStream as WebReadableStream } from "node:stream/web"
import { pipeline } from "node:stream/promises"

// Where uploads are kept.
//
// Production keeps them in a private Supabase Storage bucket, reached with the service role key, which only the server
// holds. Viewers never get that key: the media route checks who may see a file, then sends them a link that expires.
//
// RHENKO_STORAGE=local keeps them in a folder under RHENKO_DATA_DIR instead. That is for development and the test suite.
// It has to be chosen explicitly; the app never falls back to it on its own.

const LOCAL = process.env.RHENKO_STORAGE === "local"
const BUCKET = process.env.RHENKO_MEDIA_BUCKET || "media"
// How long a link to a file works. Long enough to play a video through; a browser holds the redirect for less.
const LINK_SECONDS = 60 * 60

function localPath(name: string): string {
  const dir = process.env.RHENKO_DATA_DIR || path.join(process.cwd(), "data")
  return path.join(dir, "uploads", name)
}

function supabaseEndpoint(): { base: string; key: string } {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to store uploads.")
  return { base: `${url.replace(/\/$/, "")}/storage/v1`, key }
}

function supabaseRequest(route: string, init: RequestInit = {}): Promise<Response> {
  const { base, key } = supabaseEndpoint()
  const headers = new Headers(init.headers)
  headers.set("Authorization", `Bearer ${key}`)
  headers.set("apikey", key)
  return fetch(`${base}${route}`, { ...init, headers, cache: "no-store" })
}

async function supabaseSignedUrl(name: string, seconds: number): Promise<string | null> {
  const res = await supabaseRequest(`/object/sign/${BUCKET}/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: seconds }),
  })
  if (!res.ok) return null
  const body = (await res.json()) as { signedURL?: string }
  if (!body.signedURL) return null
  return `${supabaseEndpoint().base}${body.signedURL}`
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT"
}

// Writes a file under a name, replacing whatever was stored under that name before.
export async function storeObject(name: string, body: Blob | Uint8Array, contentType: string): Promise<void> {
  if (LOCAL) {
    const target = localPath(name)
    await fs.promises.mkdir(path.dirname(target), { recursive: true })
    // Written under a temporary name and renamed when whole, so a reader never gets half a file.
    const temp = `${target}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`
    try {
      if (body instanceof Blob) await pipeline(Readable.fromWeb(body.stream() as unknown as WebReadableStream), fs.createWriteStream(temp))
      else await fs.promises.writeFile(temp, body)
      await fs.promises.rename(temp, target)
    } catch (error) {
      await fs.promises.unlink(temp).catch(() => undefined)
      throw error
    }
    return
  }
  const res = await supabaseRequest(`/object/${BUCKET}/${name}`, {
    method: "POST",
    headers: { "Content-Type": contentType, "x-upsert": "true" },
    body: body as BodyInit,
  })
  if (!res.ok) throw new Error(`Storage refused ${name} (${res.status}): ${await res.text()}`)
}

// A whole stored file, or null when it is not there.
export async function readObject(name: string): Promise<Buffer | null> {
  if (LOCAL) {
    try {
      return await fs.promises.readFile(localPath(name))
    } catch (error) {
      if (isMissing(error)) return null
      throw error
    }
  }
  const res = await supabaseRequest(`/object/authenticated/${BUCKET}/${name}`)
  if (res.status === 404 || res.status === 400) {
    await res.body?.cancel()
    return null
  }
  if (!res.ok) throw new Error(`Storage could not read ${name} (${res.status})`)
  return Buffer.from(await res.arrayBuffer())
}

// The size of a stored file in bytes, or null when it is not there. Supabase is asked for one byte, so nothing is downloaded.
export async function objectSize(name: string): Promise<number | null> {
  if (LOCAL) {
    try {
      return (await fs.promises.stat(localPath(name))).size
    } catch {
      return null
    }
  }
  const res = await supabaseRequest(`/object/authenticated/${BUCKET}/${name}`, { headers: { Range: "bytes=0-0" } })
  await res.body?.cancel()
  if (!res.ok) return null
  const total = /\/(\d+)$/.exec(res.headers.get("content-range") ?? "")
  if (total) return Number(total[1])
  const length = res.headers.get("content-length")
  return length === null ? null : Number(length)
}

// Removes stored files. A file that is already gone is not an error, and a failure is logged rather than thrown.
export async function removeObjects(names: string[]): Promise<void> {
  if (names.length === 0) return
  if (LOCAL) {
    await Promise.all(names.map((name) => fs.promises.unlink(localPath(name)).catch(() => undefined)))
    return
  }
  try {
    const res = await supabaseRequest(`/object/${BUCKET}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes: names }),
    })
    if (!res.ok) console.error("[storage] removing files failed", res.status)
  } catch (error) {
    console.error("[storage] removing files failed", error)
  }
}

// Answers a request for a stored file, or returns null when there is none. Supabase: a redirect to a link that expires,
// which storage serves itself, Range requests included. Local: the file, with Range support so a video can seek.
export async function serveObject(
  name: string,
  request: Request,
  options: { contentType: string; cacheControl: string }
): Promise<Response | null> {
  if (!LOCAL) {
    const link = await supabaseSignedUrl(name, LINK_SECONDS)
    if (!link) return null
    return new Response(null, {
      status: 307,
      headers: { Location: link, "Cache-Control": options.cacheControl, "X-Content-Type-Options": "nosniff" },
    })
  }

  const target = localPath(name)
  let size: number
  try {
    size = (await fs.promises.stat(target)).size
  } catch {
    return null
  }
  const headers: Record<string, string> = {
    "Content-Type": options.contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": options.cacheControl,
    "X-Content-Type-Options": "nosniff",
  }
  const rangeError = { "Cache-Control": options.cacheControl, "X-Content-Type-Options": "nosniff" }
  const range = request.headers.get("range")
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim())
    if (!match || (match[1] === "" && match[2] === "")) {
      return new Response(null, { status: 416, headers: { ...rangeError, "Content-Range": `bytes */${size}` } })
    }
    let start: number
    let end: number
    if (match[1] === "") {
      // Suffix range: the last N bytes.
      const suffix = Number(match[2])
      start = Math.max(size - suffix, 0)
      end = size - 1
    } else {
      start = Number(match[1])
      end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1)
    }
    if (start >= size || start > end) {
      return new Response(null, { status: 416, headers: { ...rangeError, "Content-Range": `bytes */${size}` } })
    }
    const stream = Readable.toWeb(fs.createReadStream(target, { start, end })) as unknown as ReadableStream
    return new Response(stream, {
      status: 206,
      headers: { ...headers, "Content-Length": String(end - start + 1), "Content-Range": `bytes ${start}-${end}/${size}` },
    })
  }
  const stream = Readable.toWeb(fs.createReadStream(target)) as unknown as ReadableStream
  return new Response(stream, { headers: { ...headers, "Content-Length": String(size) } })
}
