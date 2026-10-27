// GIF search through a provider the operator chooses (RHENKO_GIF_PROVIDER: giphy or klipy) with their key (RHENKO_GIF_API_KEY).
// Without a key the feature is off and the composer shows no GIF button.
//
// This file has no imports, so the browser can read its types and limits and the unit tests can run it as it is.
//
// How it is used: the browser never talks to the provider. It asks this server to search (app/api/gifs), to show a small
// preview (app/api/gifs/preview) and to fetch the chosen GIF (app/api/gifs/pick). The key stays here, the provider sees one
// server and the search words, and a viewer's address never reaches the provider's servers. The chosen GIF is handed back as
// a file and goes through the same upload checks and storage as any picture, so a post points at our copy, never at the
// provider's.
//
// The providers' standard terms do not allow this. GIPHY ("do not proxy requests to GIPHY, either API calls or media URL
// loads", "do not cache media URLs or copies of GIPHY media assets") and KLIPY ("do not route requests through partner-operated
// servers", "do not store, mirror, re-host ... copies of KLIPY media") both want the browser to call them and load their media
// itself. Both allow a different arrangement only with their written approval. Tenor's API was shut down on 30 June 2026.
// An operator who turns GIF search on needs that approval first; .env.example and the README say so.

export type GifProviderId = "giphy" | "klipy"

// What the picker shows for one GIF. `preview` and `still` are addresses on the provider's CDN until the route turns them into
// links to this server.
export type Gif = { id: string; title: string; width: number; height: number; preview: string; still: string }

// A file the provider offers for one GIF, best first, with its size in bytes when the provider says.
export type GifFileOption = { url: string; size: number | null }

export type GifRecord = Gif & { files: GifFileOption[] }

type Env = Record<string, string | undefined>
type Fetch = typeof fetch
export type GifDeps = { env?: Env; fetch?: Fetch }

export type GifProvider = {
  id: GifProviderId
  name: string
  // The search field's placeholder. KLIPY requires "Search KLIPY" here.
  placeholder: string
  // The credit shown under the grid.
  poweredBy: string
  // The domains the provider's media comes from. Nothing else is fetched.
  hosts: string[]
  validId: (id: string) => boolean
  listUrl: (key: string, request: { query: string; cursor: string | null; limit: number }) => string
  itemUrl: (key: string, id: string) => string
  parseList: (json: unknown) => { records: GifRecord[]; next: string | null } | null
  parseItem: (json: unknown) => GifRecord | null
}

export const MAX_GIF_QUERY = 50
export const GIF_PAGE_SIZE = 24
const API_TIMEOUT_MS = 6_000
const DOWNLOAD_TIMEOUT_MS = 15_000
const PREVIEW_TIMEOUT_MS = 8_000
export const PREVIEW_MAX_BYTES = 1_500_000
// A chosen GIF is fetched at most this many times, from the best size down, before the pick is refused.
const MAX_DOWNLOADS = 3
const MAX_REDIRECTS = 2
const UNAVAILABLE = "GIF search isn't available right now. Try again later."
const BUSY = "GIF search is busy. Try again in a moment."

// ── Reading what a provider sends ───────────────────────────────────────────────────────────────────────────────────

function obj(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function str(value: unknown): string {
  return typeof value === "string" ? value : ""
}

// A number that may arrive as text (GIPHY sends sizes and dimensions as strings). Null when it is missing or not above zero.
function num(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN
  return Number.isFinite(n) && n > 0 ? n : null
}

function cap(text: string, max: number): string {
  return [...text.trim()].slice(0, max).join("")
}

// A page number that came from the browser: digits only, within the range the provider allows.
function cursorNumber(cursor: string | null, min: number, max: number): number {
  if (cursor === null || !/^\d{1,4}$/.test(cursor)) return min
  return Math.min(Math.max(Number(cursor), min), max)
}

function hostMatches(host: string, domains: string[]): boolean {
  const name = host.toLowerCase()
  return domains.some((domain) => name === domain || name.endsWith(`.${domain}`))
}

// True for an https address on one of the provider's own media domains, without a login or a port.
export function isGifCdnUrl(provider: GifProvider, value: string): boolean {
  if (value.length === 0 || value.length > 2000) return false
  try {
    const url = new URL(value)
    return url.protocol === "https:" && url.username === "" && url.password === "" && url.port === "" && hostMatches(url.hostname, provider.hosts)
  } catch {
    return false
  }
}

// GIPHY names GIF renditions .gif. Anything else (an mp4 or webp that slipped into a url field) is not offered as the file.
function isGifPath(value: string): boolean {
  try {
    return new URL(value).pathname.toLowerCase().endsWith(".gif")
  } catch {
    return false
  }
}

// ── GIPHY ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// https://developers.giphy.com/docs/api/endpoint/ . The key goes in the api_key parameter. Renditions are named; the
// biggest that fits the upload limit is used, so the order here is the order of preference.

const GIPHY_FILES = ["original", "downsized_large", "downsized_medium", "downsized", "fixed_height", "fixed_width", "fixed_height_small", "fixed_width_small"]
// Teen and below. The item request carries it too, so a GIF rated higher is refused even if someone sends its id by hand.
const GIPHY_RATING = "pg-13"

function giphyRecord(raw: unknown): GifRecord | null {
  const item = obj(raw)
  const images = obj(item?.images)
  if (!item || !images) return null
  const id = str(item.id)
  const fixed = obj(images.fixed_width)
  const preview = str(fixed?.webp) || str(fixed?.url)
  const still = str(obj(images.fixed_width_still)?.url) || preview
  const width = num(fixed?.width)
  const height = num(fixed?.height)
  if (id === "" || preview === "" || width === null || height === null) return null
  const files: GifFileOption[] = []
  for (const name of GIPHY_FILES) {
    const rendition = obj(images[name])
    const url = str(rendition?.url)
    if (url !== "" && isGifPath(url)) files.push({ url, size: num(rendition?.size) })
  }
  if (files.length === 0) return null
  const title = cap(str(item.alt_text) || str(item.title) || "GIF", 120)
  return { id, title, width, height, preview, still, files }
}

const giphy: GifProvider = {
  id: "giphy",
  name: "GIPHY",
  placeholder: "Search GIPHY",
  poweredBy: "Powered by GIPHY",
  hosts: ["giphy.com"],
  validId: (id) => /^[A-Za-z0-9]{2,40}$/.test(id),
  listUrl(key, { query, cursor, limit }) {
    const params = new URLSearchParams({ api_key: key })
    if (query !== "") params.set("q", query)
    params.set("limit", String(limit))
    params.set("offset", String(cursorNumber(cursor, 0, 4999)))
    params.set("rating", GIPHY_RATING)
    return `https://api.giphy.com/v1/gifs/${query !== "" ? "search" : "trending"}?${params}`
  },
  itemUrl: (key, id) => `https://api.giphy.com/v1/gifs/${encodeURIComponent(id)}?${new URLSearchParams({ api_key: key, rating: GIPHY_RATING })}`,
  parseList(json) {
    const body = obj(json)
    if (!body || !Array.isArray(body.data)) return null
    // GIPHY answers 200 with an empty response_id when something behind it failed. That is an error, not an empty search.
    if (obj(body.meta)?.response_id === "") return null
    const records = body.data.flatMap((raw) => {
      const record = giphyRecord(raw)
      return record ? [record] : []
    })
    const paging = obj(body.pagination)
    const offset = num(paging?.offset) ?? 0
    const count = num(paging?.count) ?? 0
    const total = num(paging?.total_count) ?? 0
    const after = offset + count
    return { records, next: count > 0 && after < total && after <= 4999 ? String(after) : null }
  },
  parseItem(json) {
    const body = obj(json)
    return body ? giphyRecord(body.data) : null
  },
}

// ── KLIPY ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// https://docs.klipy.com/ . The key is part of the path. Each GIF has four sizes (hd, md, sm, xs), each in several formats.

const KLIPY_SIZES = ["hd", "md", "sm", "xs"]

function klipyRecord(raw: unknown): GifRecord | null {
  const item = obj(raw)
  const sizes = obj(item?.file)
  if (!item || !sizes) return null
  // With ads switched on for a key, KLIPY mixes advertisements into the list. They are not GIFs and are never shown.
  if (item.type !== undefined && item.type !== "gif") return null
  const id = str(item.slug)
  if (id === "") return null
  const format = (size: string, kind: string) => obj(obj(sizes[size])?.[kind])
  const previewFrom = [format("sm", "webp"), format("sm", "gif"), format("md", "webp"), format("md", "gif"), format("xs", "gif")].find((f) => str(f?.url) !== "")
  const stillFrom = [format("sm", "jpg"), format("xs", "jpg"), format("md", "jpg")].find((f) => str(f?.url) !== "")
  const preview = str(previewFrom?.url)
  const width = num(previewFrom?.width)
  const height = num(previewFrom?.height)
  if (preview === "" || width === null || height === null) return null
  const files: GifFileOption[] = []
  for (const size of KLIPY_SIZES) {
    const gif = format(size, "gif")
    const url = str(gif?.url)
    if (url !== "") files.push({ url, size: num(gif?.size) })
  }
  if (files.length === 0) return null
  return { id, title: cap(str(item.title) || "GIF", 120), width, height, preview, still: str(stillFrom?.url) || preview, files }
}

const klipy: GifProvider = {
  id: "klipy",
  name: "KLIPY",
  placeholder: "Search KLIPY",
  poweredBy: "Powered by KLIPY",
  hosts: ["klipy.com"],
  validId: (id) => /^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/.test(id),
  listUrl(key, { query, cursor, limit }) {
    const params = new URLSearchParams({ page: String(cursorNumber(cursor, 1, 100)), per_page: String(limit) })
    if (query !== "") params.set("q", query)
    params.set("content_filter", "medium")
    params.set("format_filter", "gif,webp,jpg")
    return `https://api.klipy.com/api/v1/${encodeURIComponent(key)}/gifs/${query !== "" ? "search" : "trending"}?${params}`
  },
  itemUrl: (key, id) => `https://api.klipy.com/api/v1/${encodeURIComponent(key)}/gifs/items?${new URLSearchParams({ slugs: id })}`,
  parseList(json) {
    const body = obj(json)
    const data = obj(body?.data)
    if (!body || body.result === false || !data || !Array.isArray(data.data)) return null
    const records = data.data.flatMap((raw) => {
      const record = klipyRecord(raw)
      return record ? [record] : []
    })
    const page = num(data.current_page) ?? 1
    return { records, next: data.has_next === true && page < 100 ? String(page + 1) : null }
  },
  parseItem(json) {
    const body = obj(json)
    const data = obj(body?.data)
    if (!body || body.result === false || !data || !Array.isArray(data.data)) return null
    return klipyRecord(data.data[0])
  },
}

const PROVIDERS: ReadonlyMap<string, GifProvider> = new Map<string, GifProvider>([
  [giphy.id, giphy],
  [klipy.id, klipy],
])

// ── Setup ───────────────────────────────────────────────────────────────────────────────────────────────────────────

export type GifSetup = { provider: GifProvider; key: string }

// The provider and key, or null when GIF search is off. It is off without a key, and when the provider is missing or is not
// one of giphy and klipy: a key is useless without knowing whose it is, and guessing could send it to the wrong company.
export function gifSetup(env: Env = process.env): GifSetup | null {
  const key = (env.RHENKO_GIF_API_KEY ?? "").trim()
  if (key === "") return null
  const provider = PROVIDERS.get((env.RHENKO_GIF_PROVIDER ?? "").trim().toLowerCase())
  return provider ? { provider, key } : null
}

// What the browser may know. Never the key.
export type GifPublicSetup = { enabled: false } | { enabled: true; name: string; placeholder: string; poweredBy: string }

const warned = new Set<string>()

export function publicGifSetup(env: Env = process.env, warn: (message: string) => void = console.warn): GifPublicSetup {
  const setup = gifSetup(env)
  if (!setup) {
    const named = (env.RHENKO_GIF_PROVIDER ?? "").trim()
    if ((env.RHENKO_GIF_API_KEY ?? "").trim() !== "" && !warned.has(named)) {
      warned.add(named)
      warn(
        named.toLowerCase() === "tenor"
          ? "[gifs] RHENKO_GIF_PROVIDER=tenor: Tenor's API was shut down on 30 June 2026. Use giphy or klipy. GIF search is off."
          : `[gifs] RHENKO_GIF_PROVIDER must be giphy or klipy (it is "${named}"). GIF search is off.`
      )
    }
    return { enabled: false }
  }
  const { provider } = setup
  return { enabled: true, name: provider.name, placeholder: provider.placeholder, poweredBy: provider.poweredBy }
}

// What the person typed, made fit to send: control characters and runs of spaces become one space, and it is cut to the
// length GIPHY allows.
export function cleanGifQuery(raw: string | null | undefined): string {
  const text = String(raw ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim()
  return cap(text, MAX_GIF_QUERY)
}

// The link the browser uses for a provider picture: this server fetches it, so the viewer's browser never contacts the provider.
export function previewPath(url: string): string {
  return `/api/gifs/preview?u=${encodeURIComponent(url)}`
}

// ── Talking to the provider ─────────────────────────────────────────────────────────────────────────────────────────

export type GifFailure = { ok: false; status: number; error: string }
const NOT_SET_UP: GifFailure = { ok: false, status: 503, error: "GIF search isn't set up on this server." }
const UNAVAILABLE_FAILURE: GifFailure = { ok: false, status: 502, error: UNAVAILABLE }

// One request to the provider's API. The address holds the key, so it is never logged: only the status is.
async function getJson(url: string, fetchImpl: Fetch): Promise<{ ok: true; json: unknown } | GifFailure> {
  let response: Response
  try {
    response = await fetchImpl(url, { cache: "no-store", headers: { accept: "application/json" }, signal: AbortSignal.timeout(API_TIMEOUT_MS) })
  } catch {
    console.error("[gifs] the provider did not answer")
    return UNAVAILABLE_FAILURE
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined)
    console.error(`[gifs] the provider answered ${response.status}`)
    if (response.status === 429) return { ok: false, status: 429, error: BUSY }
    if (response.status === 404) return { ok: false, status: 404, error: "That GIF isn't available any more." }
    return UNAVAILABLE_FAILURE
  }
  try {
    return { ok: true, json: await response.json() }
  } catch {
    console.error("[gifs] the provider sent something that is not JSON")
    return UNAVAILABLE_FAILURE
  }
}

export type GifSearch = { ok: true; gifs: Gif[]; next: string | null } | GifFailure

// Trending GIFs when the query is empty, otherwise a search. `cursor` is the `next` of the page before.
export async function searchGifs(input: { query: string; cursor?: string | null }, deps: GifDeps = {}): Promise<GifSearch> {
  const setup = gifSetup(deps.env)
  if (!setup) return NOT_SET_UP
  const { provider, key } = setup
  const url = provider.listUrl(key, { query: cleanGifQuery(input.query), cursor: input.cursor ?? null, limit: GIF_PAGE_SIZE })
  const got = await getJson(url, deps.fetch ?? fetch)
  if (!got.ok) return got
  const page = provider.parseList(got.json)
  if (!page) {
    console.error("[gifs] the provider's answer was not in the expected shape")
    return UNAVAILABLE_FAILURE
  }
  // A GIF whose pictures are not on the provider's own domains is dropped.
  const gifs = page.records
    .filter((record) => isGifCdnUrl(provider, record.preview) && isGifCdnUrl(provider, record.still))
    .map(({ id, title, width, height, preview, still }) => ({ id, title, width, height, preview, still }))
  return { ok: true, gifs, next: page.next }
}

// ── Fetching a picture from the provider's CDN ──────────────────────────────────────────────────────────────────────

type Download = { kind: "ok"; bytes: Uint8Array<ArrayBuffer>; type: string } | { kind: "big" } | { kind: "failed" }

// Downloads one address from the provider's CDN. The body is read only up to `maxBytes`, so a file that is too big is dropped
// part way. A redirect is followed only to another address on the provider's domains.
async function download(provider: GifProvider, start: string, maxBytes: number, accept: string, timeoutMs: number, fetchImpl: Fetch): Promise<Download> {
  let url = start
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isGifCdnUrl(provider, url)) return { kind: "failed" }
    let response: Response
    try {
      response = await fetchImpl(url, { cache: "no-store", redirect: "manual", headers: { accept }, signal: AbortSignal.timeout(timeoutMs) })
    } catch {
      return { kind: "failed" }
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location")
      await response.body?.cancel().catch(() => undefined)
      if (!location) return { kind: "failed" }
      try {
        url = new URL(location, url).toString()
      } catch {
        return { kind: "failed" }
      }
      continue
    }
    if (!response.ok || !response.body) {
      await response.body?.cancel().catch(() => undefined)
      return { kind: "failed" }
    }
    const declared = Number(response.headers.get("content-length"))
    if (Number.isFinite(declared) && declared > maxBytes) {
      await response.body.cancel().catch(() => undefined)
      return { kind: "big" }
    }
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        total += value.byteLength
        if (total > maxBytes) {
          await reader.cancel().catch(() => undefined)
          return { kind: "big" }
        }
        chunks.push(value)
      }
    } catch {
      return { kind: "failed" }
    }
    const bytes = new Uint8Array(total)
    let at = 0
    for (const chunk of chunks) {
      bytes.set(chunk, at)
      at += chunk.byteLength
    }
    return { kind: "ok", bytes, type: (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase() }
  }
  return { kind: "failed" }
}

function isGifBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 10) return false
  const head = String.fromCharCode(...bytes.subarray(0, 6))
  return head === "GIF87a" || head === "GIF89a"
}

export type GifFile = { ok: true; bytes: Uint8Array<ArrayBuffer>; title: string; size: number; source: string } | GifFailure

// The file for a chosen GIF. The provider is asked about the GIF again by its id, so the browser never says which address to
// fetch. The biggest size that fits `maxBytes` is used: a size the provider lists as too big is skipped, and one that turns
// out too big (or is not a GIF) is dropped and the next smaller size is tried. If nothing fits, the pick is refused.
export async function fetchGifFile(id: string, options: { maxBytes: number }, deps: GifDeps = {}): Promise<GifFile> {
  const setup = gifSetup(deps.env)
  if (!setup) return NOT_SET_UP
  const { provider, key } = setup
  if (!provider.validId(id)) return { ok: false, status: 400, error: "That GIF isn't available." }
  const fetchImpl = deps.fetch ?? fetch
  const got = await getJson(provider.itemUrl(key, id), fetchImpl)
  if (!got.ok) return got
  const record = provider.parseItem(got.json)
  if (!record) return { ok: false, status: 404, error: "That GIF isn't available any more." }

  let tooBig = false
  let downloads = 0
  for (const file of record.files) {
    if (!isGifCdnUrl(provider, file.url)) continue
    if (file.size !== null && file.size > options.maxBytes) {
      tooBig = true
      continue
    }
    if (downloads >= MAX_DOWNLOADS) break
    downloads += 1
    const got = await download(provider, file.url, options.maxBytes, "image/gif", DOWNLOAD_TIMEOUT_MS, fetchImpl)
    if (got.kind === "big") tooBig = true
    if (got.kind === "ok" && isGifBytes(got.bytes)) return { ok: true, bytes: got.bytes, title: record.title, size: got.bytes.length, source: file.url }
  }
  if (tooBig) {
    const mb = Math.round(options.maxBytes / (1024 * 1024))
    return { ok: false, status: 413, error: `That GIF is over ${mb} MB, even in its smaller sizes. Pick another.` }
  }
  return { ok: false, status: 502, error: "That GIF couldn't be downloaded. Try another." }
}

const PREVIEW_TYPES = new Set(["image/gif", "image/webp", "image/jpeg", "image/png"])

export type GifPreview = { ok: true; bytes: Uint8Array<ArrayBuffer>; type: string } | GifFailure

// A picture for the grid. `url` came from the browser, so it is fetched only if it is on the provider's own domains, and what
// comes back must be a small picture.
export async function fetchGifPreview(url: string, deps: GifDeps = {}): Promise<GifPreview> {
  const setup = gifSetup(deps.env)
  if (!setup) return NOT_SET_UP
  if (!isGifCdnUrl(setup.provider, url)) return { ok: false, status: 400, error: "Not a GIF picture." }
  const got = await download(setup.provider, url, PREVIEW_MAX_BYTES, "image/webp,image/gif,image/jpeg,image/png", PREVIEW_TIMEOUT_MS, deps.fetch ?? fetch)
  if (got.kind !== "ok" || !PREVIEW_TYPES.has(got.type)) return { ok: false, status: 502, error: "That picture couldn't be loaded." }
  return { ok: true, bytes: got.bytes, type: got.type }
}
