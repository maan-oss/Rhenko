import { createHash, createHmac } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { Readable } from "node:stream"
import type { ReadableStream as WebReadableStream } from "node:stream/web"
import { pipeline } from "node:stream/promises"

// Where uploads are kept. RHENKO_STORAGE chooses one of three:
//
// r2: a private Cloudflare R2 bucket, reached over its S3 API with the access key in RHENKO_R2_*. The production choice.
// supabase: a private Supabase Storage bucket, reached with the service role key. This is what is used when nothing is set.
// local: a folder under RHENKO_DATA_DIR. For development and the test suite. It has to be chosen explicitly.
//
// Whatever the choice, viewers never get the storage key. The media route checks who may see a file, then sends them a
// link to it that expires.

const MODE = process.env.RHENKO_STORAGE
const LOCAL = MODE === "local"
const R2 = MODE === "r2"
const BUCKET = process.env.RHENKO_MEDIA_BUCKET || "media"
// How long a link to a file works. Long enough to play a video through; a browser holds the redirect for less.
const LINK_SECONDS = 60 * 60

function localPath(name: string): string {
  const dir = process.env.RHENKO_DATA_DIR || path.join(process.cwd(), "data")
  return path.join(dir, "uploads", name)
}

// ── Cloudflare R2 ──────────────────────────────────────────────────────────────────────────────────────────────────────
// Requests are signed with AWS Signature Version 4, which R2 takes with the region "auto". An upload is signed with the
// UNSIGNED-PAYLOAD marker, so a long video streams up without being held in memory to be hashed first.

type R2Settings = { origin: string; host: string; bucket: string; keyId: string; secret: string }
let r2Settings: R2Settings | null = null

function r2(): R2Settings {
  if (r2Settings) return r2Settings
  const endpoint = process.env.RHENKO_R2_ENDPOINT
  const bucket = process.env.RHENKO_R2_BUCKET
  const keyId = process.env.RHENKO_R2_ACCESS_KEY_ID
  const secret = process.env.RHENKO_R2_SECRET_ACCESS_KEY
  if (!endpoint || !bucket || !keyId || !secret) {
    throw new Error("RHENKO_R2_ENDPOINT, RHENKO_R2_BUCKET, RHENKO_R2_ACCESS_KEY_ID and RHENKO_R2_SECRET_ACCESS_KEY must be set to store uploads in R2.")
  }
  const url = new URL(endpoint)
  r2Settings = { origin: url.origin, host: url.host, bucket, keyId, secret }
  return r2Settings
}

const EMPTY_HASH = createHash("sha256").update("").digest("hex")
const UNSIGNED_PAYLOAD = "UNSIGNED-PAYLOAD"

function sha256Hex(text: string): string {
  return createHash("sha256").update(text).digest("hex")
}

// Encodes as SigV4 requires. Unlike encodeURIComponent it also encodes ! ' ( ) *.
function encodeStrict(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
}

// Path-style addressing: the bucket, then the object key, which may contain slashes (variants/...).
function canonicalPath(cfg: R2Settings, key: string | null): string {
  const parts = [cfg.bucket, ...(key ? key.split("/") : [])]
  return `/${parts.map(encodeStrict).join("/")}`
}

function canonicalQuery(query: Record<string, string>): string {
  return Object.keys(query)
    .sort()
    .map((name) => `${encodeStrict(name)}=${encodeStrict(query[name])}`)
    .join("&")
}

function dateParts(): { amz: string; date: string } {
  const amz = new Date().toISOString().replace(/[-:]|\.\d{3}/g, "")
  return { amz, date: amz.slice(0, 8) }
}

function scopeFor(date: string): string {
  return `${date}/auto/s3/aws4_request`
}

function signatureFor(cfg: R2Settings, date: string, stringToSign: string): string {
  const dateKey = createHmac("sha256", `AWS4${cfg.secret}`).update(date).digest()
  const regionKey = createHmac("sha256", dateKey).update("auto").digest()
  const serviceKey = createHmac("sha256", regionKey).update("s3").digest()
  const signingKey = createHmac("sha256", serviceKey).update("aws4_request").digest()
  return createHmac("sha256", signingKey).update(stringToSign).digest("hex")
}

// The headers that sign one request. The host is signed but not returned: fetch sends it.
function signedHeaders(cfg: R2Settings, method: string, key: string | null, payload: string, extra: Record<string, string>): Record<string, string> {
  const { amz, date } = dateParts()
  const headers: Record<string, string> = { "x-amz-content-sha256": payload, "x-amz-date": amz }
  for (const [name, value] of Object.entries(extra)) headers[name.toLowerCase()] = value
  const values: Record<string, string> = { ...headers, host: cfg.host }
  const names = Object.keys(values).sort()
  const canonical = [
    method,
    canonicalPath(cfg, key),
    "",
    names.map((name) => `${name}:${values[name].trim()}\n`).join(""),
    names.join(";"),
    payload,
  ].join("\n")
  const stringToSign = ["AWS4-HMAC-SHA256", amz, scopeFor(date), sha256Hex(canonical)].join("\n")
  const authorization = `AWS4-HMAC-SHA256 Credential=${cfg.keyId}/${scopeFor(date)}, SignedHeaders=${names.join(";")}, Signature=${signatureFor(cfg, date, stringToSign)}`
  return { ...headers, Authorization: authorization }
}

// A link to an object that works for `seconds`, signed in the query string so a browser can follow it directly.
function presignedUrl(cfg: R2Settings, key: string, seconds: number): string {
  const { amz, date } = dateParts()
  const query: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${cfg.keyId}/${scopeFor(date)}`,
    "X-Amz-Date": amz,
    "X-Amz-Expires": String(seconds),
    "X-Amz-SignedHeaders": "host",
  }
  const path = canonicalPath(cfg, key)
  const canonical = ["GET", path, canonicalQuery(query), `host:${cfg.host}\n`, "host", UNSIGNED_PAYLOAD].join("\n")
  const stringToSign = ["AWS4-HMAC-SHA256", amz, scopeFor(date), sha256Hex(canonical)].join("\n")
  const signed = { ...query, "X-Amz-Signature": signatureFor(cfg, date, stringToSign) }
  return `${cfg.origin}${path}?${canonicalQuery(signed)}`
}

async function r2Request(
  method: string,
  key: string,
  payload: string,
  init: { body?: BodyInit; headers?: Record<string, string> } = {}
): Promise<Response> {
  const cfg = r2()
  const headers = signedHeaders(cfg, method, key, payload, init.headers ?? {})
  return await fetch(`${cfg.origin}${canonicalPath(cfg, key)}`, { method, headers, body: init.body, cache: "no-store" })
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
  if (R2) {
    const res = await r2Request("PUT", name, UNSIGNED_PAYLOAD, { body: body as BodyInit, headers: { "Content-Type": contentType } })
    if (!res.ok) throw new Error(`Storage refused ${name} (${res.status}): ${await res.text()}`)
    return
  }
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
  if (R2) {
    const res = await r2Request("GET", name, EMPTY_HASH)
    if (res.status === 404) {
      await res.body?.cancel()
      return null
    }
    if (!res.ok) throw new Error(`Storage could not read ${name} (${res.status})`)
    return Buffer.from(await res.arrayBuffer())
  }
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
  if (R2) {
    const res = await r2Request("HEAD", name, EMPTY_HASH)
    await res.body?.cancel()
    if (!res.ok) return null
    const length = res.headers.get("content-length")
    return length === null ? null : Number(length)
  }
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
  if (R2) {
    await Promise.all(
      names.map(async (name) => {
        try {
          const res = await r2Request("DELETE", name, EMPTY_HASH)
          await res.body?.cancel()
          if (!res.ok) console.error("[storage] removing a file failed", res.status)
        } catch (error) {
          console.error("[storage] removing a file failed", error)
        }
      })
    )
    return
  }
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
  if (R2) {
    return new Response(null, {
      status: 307,
      headers: { Location: presignedUrl(r2(), name, LINK_SECONDS), "Cache-Control": options.cacheControl, "X-Content-Type-Options": "nosniff" },
    })
  }
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
