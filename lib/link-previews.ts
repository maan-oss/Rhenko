import { randomUUID } from "node:crypto"
import dns from "node:dns/promises"
import http from "node:http"
import https from "node:https"
import net from "node:net"
import { all, run } from "@/lib/db"
import { contentTypeFor, removeUpload, storeObject } from "@/lib/uploads"

// Link previews: the title, description and picture of the first link in a post, read from the page once and kept.
// The server fetches a page on a viewer's behalf, so it refuses anything that is not a public web address, and
// connects to the address it checked (never a second lookup), so a name cannot be turned toward the server's own network.
// The picture is stored on this site, checked by its first bytes, so a viewer's browser never contacts the other site.

export type LinkPreview = { url: string; title: string; description: string; site: string; image: string | null }

// What a page's head says, before its picture has been fetched.
type ParsedPreview = { url: string; title: string; description: string; site: string; imageUrl: string | null }

const TIMEOUT_MS = 5_000
const PAGE_BYTES = 512 * 1024
const IMAGE_BYTES = 2 * 1024 * 1024
const MAX_REDIRECTS = 3
const FRESH_MS = 7 * 24 * 60 * 60 * 1000
const MAX_QUEUE = 200
const WORKERS = 3

// True for an address a server should never reach on a visitor's behalf: private, loopback, link-local, shared,
// multicast, reserved, and the IPv6 forms of those.
export function isPublicAddress(address: string): boolean {
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number)
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false
    if (a === 100 && b >= 64 && b <= 127) return false
    if (a === 169 && b === 254) return false
    if (a === 172 && b >= 16 && b <= 31) return false
    if (a === 192 && (b === 0 || b === 168)) return false
    if (a === 198 && (b === 18 || b === 19 || b === 51)) return false
    if (a === 203 && b === 0) return false
    return true
  }
  if (net.isIPv6(address)) {
    const lower = address.toLowerCase()
    if (lower === "::" || lower === "::1") return false
    if (/^fe[89ab]/.test(lower)) return false
    if (/^f[cd]/.test(lower)) return false
    if (lower.startsWith("ff")) return false
    if (lower.startsWith("2001:db8")) return false
    if (lower.startsWith("::ffff:")) {
      const dotted = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower)
      return dotted ? isPublicAddress(dotted[1]) : false
    }
    return true
  }
  return false
}

// The first http or https address in a post, without the punctuation that ends a sentence.
export function firstLink(body: string): string | null {
  const match = /https?:\/\/[^\s<>"]+/.exec(body)
  if (!match) return null
  const url = match[0].replace(/[.,!?;:)\]]+$/, "")
  return url.length <= 2000 ? url : null
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " }

function decode(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Math.min(parseInt(hex, 16), 0x10ffff)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Math.min(parseInt(dec, 10), 0x10ffff)))
    .replace(/&([a-z]+);/gi, (match, name) => ENTITIES[name.toLowerCase()] ?? match)
    .replace(/\s+/g, " ")
    .trim()
}

function attributesOf(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {}
  for (const match of tag.matchAll(/([a-zA-Z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
    attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? ""
  }
  return attributes
}

// Reads the title, description, site name and picture address from a page's head. Open Graph and Twitter tags win
// over the plain ones.
export function parsePreview(html: string, url: string): ParsedPreview | null {
  const head = html.slice(0, 200_000)
  const meta = new Map<string, string>()
  for (const tag of head.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = attributesOf(tag[0])
    const key = (attributes.property ?? attributes.name ?? "").toLowerCase()
    if (key && attributes.content !== undefined && !meta.has(key)) meta.set(key, decode(attributes.content))
  }
  const plainTitle = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)
  const title = (meta.get("og:title") || meta.get("twitter:title") || (plainTitle ? decode(plainTitle[1]) : "")).slice(0, 200)
  if (!title) return null
  const description = (meta.get("og:description") || meta.get("twitter:description") || meta.get("description") || "").slice(0, 400)
  let host = ""
  try {
    host = new URL(url).hostname.replace(/^www\./, "")
  } catch {
    host = ""
  }
  const site = (meta.get("og:site_name") || host).slice(0, 80)
  const rawImage = meta.get("og:image") || meta.get("og:image:url") || meta.get("twitter:image") || meta.get("twitter:image:src") || ""
  return { url, title, description, site, imageUrl: pictureAddress(rawImage, url) }
}

// The picture's full address, when it is a web address of reasonable length.
function pictureAddress(raw: string, pageUrl: string): string | null {
  if (!raw) return null
  try {
    const resolved = new URL(raw, pageUrl)
    if (resolved.protocol !== "https:" && resolved.protocol !== "http:") return null
    const text = resolved.toString()
    return text.length <= 2000 ? text : null
  } catch {
    return null
  }
}

type Reply = { status: number; location: string | null; type: string; body: Buffer; truncated: boolean }

// One request to a page, connected to the address that was checked. The body is read up to a fixed size, and says
// when it was cut short.
function request(url: URL, address: string, family: number, maxBytes: number, accept: string): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http
    const lookup = (_host: string, options: { all?: boolean }, callback: (...args: unknown[]) => void) => {
      if (options.all) callback(null, [{ address, family }])
      else callback(null, address, family)
    }
    const req = client.request(
      url,
      {
        method: "GET",
        headers: { "User-Agent": "RhenkoLinkPreview/1.0", Accept: accept },
        timeout: TIMEOUT_MS,
        lookup: lookup as never,
      },
      (res) => {
        const status = res.statusCode ?? 0
        const location = res.headers.location ?? null
        const type = String(res.headers["content-type"] ?? "")
        if (status >= 300 && status < 400) {
          res.resume()
          resolve({ status, location, type, body: Buffer.alloc(0), truncated: false })
          return
        }
        const chunks: Buffer[] = []
        let size = 0
        let finished = false
        const finish = (truncated: boolean) => {
          if (finished) return
          finished = true
          resolve({ status, location, type, body: Buffer.concat(chunks).subarray(0, maxBytes), truncated })
        }
        res.on("data", (chunk: Buffer) => {
          size += chunk.length
          chunks.push(chunk)
          if (size > maxBytes) {
            res.destroy()
            finish(true)
          }
        })
        res.on("end", () => finish(false))
        res.on("error", () => finish(true))
      }
    )
    req.on("timeout", () => req.destroy(new Error("timeout")))
    req.on("error", reject)
    req.end()
  })
}

// Checks the name's addresses, and connects to the first one when every address is public.
async function publicAddress(url: URL): Promise<{ address: string; family: number } | null> {
  const found = await dns.lookup(url.hostname, { all: true, verbatim: true })
  if (found.length === 0 || found.some((entry) => !isPublicAddress(entry.address))) return null
  return { address: found[0].address, family: found[0].family }
}

// Fetches one address, following a few redirects, each one checked the same way. Returns the final reply when it is a
// success that the accepted kind of content describes, and null for anything else.
async function fetchAccepted(
  link: string,
  maxBytes: number,
  accept: string,
  kindOk: (type: string) => boolean
): Promise<Reply | null> {
  let current: URL
  try {
    current = new URL(link)
  } catch {
    return null
  }
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (current.protocol !== "https:" && current.protocol !== "http:") return null
    if (current.username || current.password) return null
    const target = await publicAddress(current).catch(() => null)
    if (!target) return null
    const reply = await request(current, target.address, target.family, maxBytes, accept).catch(() => null)
    if (!reply) return null
    if (reply.status >= 300 && reply.status < 400 && reply.location) {
      try {
        current = new URL(reply.location, current)
      } catch {
        return null
      }
      continue
    }
    if (reply.status !== 200 || !kindOk(reply.type)) return null
    return reply
  }
  return null
}

const isHtml = (type: string) => /^text\/html|^application\/xhtml\+xml/i.test(type)
const isImage = (type: string) => /^image\/(jpeg|png|gif|webp)\b/i.test(type)

// Fetches a page's preview, following a few redirects, each one checked the same way.
export async function fetchPreview(link: string): Promise<ParsedPreview | null> {
  const reply = await fetchAccepted(link, PAGE_BYTES, "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1", isHtml)
  return reply ? parsePreview(reply.body.toString("utf8"), link) : null
}

// The file type of a picture by its first bytes, so a file that says it is a picture but is not one is refused.
export function pictureExtension(body: Buffer): "jpg" | "png" | "gif" | "webp" | null {
  if (body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) return "jpg"
  if (body.length >= 8 && body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png"
  if (body.length >= 6 && (body.subarray(0, 6).toString("ascii") === "GIF87a" || body.subarray(0, 6).toString("ascii") === "GIF89a")) return "gif"
  if (body.length >= 12 && body.subarray(0, 4).toString("ascii") === "RIFF" && body.subarray(8, 12).toString("ascii") === "WEBP") return "webp"
  return null
}

// Keeps a link's picture on this site under a random name. A name made from the link would let anyone who knows the link
// check whether it was shared here, even in a protected post, by asking for the picture's file. The row keeps the name.
async function storePicture(link: string, imageUrl: string, previous: string | null): Promise<string | null> {
  const reply = await fetchAccepted(imageUrl, IMAGE_BYTES, "image/jpeg,image/png,image/webp,image/gif;q=0.9,*/*;q=0.1", isImage)
  if (!reply || reply.truncated) return null
  const extension = pictureExtension(reply.body)
  if (!extension) return null
  const name = `${randomUUID().replace(/-/g, "")}.${extension}`
  await storeObject(name, new Uint8Array(reply.body), contentTypeFor(name))
  // The previous fetch's picture and its smaller copies go once the new one is stored.
  if (previous && previous !== name) await removeUpload(previous)
  return name
}

// Previews already read, by link. A link whose page had no title is kept as a row with no title, so it is not fetched
// again until it is stale.
export async function previewsFor(links: string[]): Promise<Map<string, LinkPreview>> {
  const found = new Map<string, LinkPreview>()
  if (links.length === 0) return found
  const marks = links.map(() => "?").join(",")
  const rows = await all<{ url: string; title: string | null; description: string | null; site: string | null; image_file: string | null }>(
    `SELECT url, title, description, site, image_file FROM link_previews WHERE url IN (${marks}) AND title IS NOT NULL`,
    ...links
  )
  for (const row of rows) {
    found.set(row.url, {
      url: row.url,
      title: row.title ?? "",
      description: row.description ?? "",
      site: row.site ?? "",
      image: row.image_file,
    })
  }
  return found
}

// The links whose previews are missing or stale. Fetching happens in the background, a few at a time.
const waiting: string[] = []
const pending = new Set<string>()
// Callbacks to run once a link has been read, by link. A chat message uses one to show its preview as soon as it is ready.
const waiters = new Map<string, Array<() => void>>()
let working = 0

// Queues the links whose previews are missing or stale. `onReady` runs once every link it was given to read has been read,
// or straight away when none needs reading, so the caller knows the previews can be shown now.
export async function requestPreviews(links: string[], onReady?: () => void): Promise<void> {
  const stale = links.length === 0 ? [] : await staleLinks(links)
  const reading = new Set<string>()
  for (const link of stale) {
    if (!pending.has(link)) {
      if (waiting.length >= MAX_QUEUE) continue
      pending.add(link)
      waiting.push(link)
    }
    reading.add(link)
  }
  if (onReady) {
    if (reading.size === 0) onReady()
    else {
      let left = reading.size
      const done = () => {
        left -= 1
        if (left === 0) onReady()
      }
      for (const link of reading) waiters.set(link, [...(waiters.get(link) ?? []), done])
    }
  }
  await pump()
}

// Runs the callbacks waiting on a link, once its row is written.
function settle(link: string): void {
  const done = waiters.get(link) ?? []
  waiters.delete(link)
  for (const callback of done) callback()
}

async function staleLinks(links: string[]): Promise<string[]> {
  const marks = links.map(() => "?").join(",")
  const fresh = new Set(
    (await all<{ url: string }>(`SELECT url FROM link_previews WHERE url IN (${marks}) AND fetched_at > ?`, ...links, Date.now() - FRESH_MS)).map(
      (row) => row.url
    )
  )
  return links.filter((link) => !fresh.has(link))
}

async function pump(): Promise<void> {
  while (working < WORKERS && waiting.length > 0) {
    const link = waiting.shift() as string
    working++
    void load(link)
      .catch(() => undefined)
      .finally(async () => {
        working--
        pending.delete(link)
        settle(link)
        await pump()
      })
  }
}

async function load(link: string): Promise<void> {
  const previous = (await all<{ image_file: string | null }>("SELECT image_file FROM link_previews WHERE url = ?", link))[0]?.image_file ?? null
  const preview = await fetchPreview(link).catch(() => null)
  const image = preview?.imageUrl ? await storePicture(link, preview.imageUrl, previous).catch(() => null) : null
  await run(
    "INSERT INTO link_previews (url, title, description, site, image_file, fetched_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (url) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description, site = EXCLUDED.site, image_file = EXCLUDED.image_file, fetched_at = EXCLUDED.fetched_at",
    link,
    preview?.title ?? null,
    preview?.description ?? null,
    preview?.site ?? null,
    image,
    Date.now()
  )
  // A refreshed preview with no picture leaves the old one behind, so its file is removed.
  if (image === null && previous) await removeUpload(previous)
}
