import dns from "node:dns/promises"
import http from "node:http"
import https from "node:https"
import net from "node:net"
import { all, run } from "@/lib/db"

// Link previews: the title and description of the first link in a post, read from the page once and kept.
// The server fetches a page on a viewer's behalf, so it refuses anything that is not a public web address, and
// connects to the address it checked (never a second lookup), so a name cannot be turned toward the server's own network.

export type LinkPreview = { url: string; title: string; description: string; site: string }

const TIMEOUT_MS = 5_000
const MAX_BYTES = 512 * 1024
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

// Reads the title, description and site name from a page's head. Open Graph and Twitter tags win over the plain ones.
export function parsePreview(html: string, url: string): LinkPreview | null {
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
  return { url, title, description, site }
}

type Reply = { status: number; location: string | null; type: string; body: string }

// One request to a page, connected to the address that was checked. The body is read up to a fixed size.
function request(url: URL, address: string, family: number): Promise<Reply> {
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
        headers: { "User-Agent": "RhenkoLinkPreview/1.0", Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1" },
        timeout: TIMEOUT_MS,
        lookup: lookup as never,
      },
      (res) => {
        const status = res.statusCode ?? 0
        const location = res.headers.location ?? null
        const type = String(res.headers["content-type"] ?? "")
        if (status >= 300 && status < 400) {
          res.resume()
          resolve({ status, location, type, body: "" })
          return
        }
        const chunks: Buffer[] = []
        let size = 0
        res.on("data", (chunk: Buffer) => {
          size += chunk.length
          chunks.push(chunk)
          if (size >= MAX_BYTES) {
            res.destroy()
            resolve({ status, location, type, body: Buffer.concat(chunks).toString("utf8") })
          }
        })
        res.on("end", () => resolve({ status, location, type, body: Buffer.concat(chunks).toString("utf8") }))
        res.on("error", () => resolve({ status, location, type, body: Buffer.concat(chunks).toString("utf8") }))
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

// Fetches a page's preview, following a few redirects, each one checked the same way.
export async function fetchPreview(link: string): Promise<LinkPreview | null> {
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
    const reply = await request(current, target.address, target.family).catch(() => null)
    if (!reply) return null
    if (reply.status >= 300 && reply.status < 400 && reply.location) {
      try {
        current = new URL(reply.location, current)
      } catch {
        return null
      }
      continue
    }
    if (reply.status !== 200 || !/^text\/html|^application\/xhtml\+xml/i.test(reply.type)) return null
    return parsePreview(reply.body, link)
  }
  return null
}

// Previews already read, by link. A link whose page had no title is kept as a row with no title, so it is not fetched
// again until it is stale.
export function previewsFor(links: string[]): Map<string, LinkPreview> {
  const found = new Map<string, LinkPreview>()
  if (links.length === 0) return found
  const marks = links.map(() => "?").join(",")
  const rows = all<{ url: string; title: string | null; description: string | null; site: string | null }>(
    `SELECT url, title, description, site FROM link_previews WHERE url IN (${marks}) AND title IS NOT NULL`,
    ...links
  )
  for (const row of rows) {
    found.set(row.url, { url: row.url, title: row.title ?? "", description: row.description ?? "", site: row.site ?? "" })
  }
  return found
}

// The links whose previews are missing or stale. Fetching happens in the background, a few at a time.
const waiting: string[] = []
const pending = new Set<string>()
let working = 0

export function requestPreviews(links: string[]): void {
  const stale = links.length === 0 ? [] : staleLinks(links)
  for (const link of stale) {
    if (pending.has(link) || waiting.length >= MAX_QUEUE) continue
    pending.add(link)
    waiting.push(link)
  }
  pump()
}

function staleLinks(links: string[]): string[] {
  const marks = links.map(() => "?").join(",")
  const fresh = new Set(
    all<{ url: string }>(`SELECT url FROM link_previews WHERE url IN (${marks}) AND fetched_at > ?`, ...links, Date.now() - FRESH_MS).map(
      (row) => row.url
    )
  )
  return links.filter((link) => !fresh.has(link))
}

function pump(): void {
  while (working < WORKERS && waiting.length > 0) {
    const link = waiting.shift() as string
    working++
    void load(link)
      .catch(() => undefined)
      .finally(() => {
      working--
      pending.delete(link)
      pump()
    })
  }
}

async function load(link: string): Promise<void> {
  const preview = await fetchPreview(link).catch(() => null)
  run(
    "INSERT OR REPLACE INTO link_previews (url, title, description, site, fetched_at) VALUES (?, ?, ?, ?, ?)",
    link,
    preview?.title ?? null,
    preview?.description ?? null,
    preview?.site ?? null,
    Date.now()
  )
}
