// Unit checks for GIF search in lib/gifs.ts, with fetch mocked: the request each provider is sent, how its answer becomes the
// list the panel shows, the refusal when no key is set, and the choice of a smaller size when a GIF is over the upload limit.
// Run with: npm run test:unit

import { test } from "node:test"
import assert from "node:assert/strict"
import {
  GIF_PAGE_SIZE,
  MAX_GIF_QUERY,
  cleanGifQuery,
  fetchGifFile,
  fetchGifPreview,
  gifSetup,
  isGifCdnUrl,
  previewPath,
  publicGifSetup,
  searchGifs,
} from "../lib/gifs.ts"

const KEY = "test-key-123"
const GIPHY = { RHENKO_GIF_PROVIDER: "giphy", RHENKO_GIF_API_KEY: KEY }
const KLIPY = { RHENKO_GIF_PROVIDER: "klipy", RHENKO_GIF_API_KEY: KEY }
const FOUR_MB = 4 * 1024 * 1024

// What the server logs when the provider fails. The key is in the address of every request, so it must never be in here.
const logged = []
console.error = (...parts) => logged.push(parts.join(" "))

function mockFetch(handler) {
  const calls = []
  const fn = async (url, init) => {
    calls.push(String(url))
    return handler(String(url), init)
  }
  fn.calls = calls
  return fn
}

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
const gifBytes = (length) => Buffer.concat([Buffer.from("GIF89a"), Buffer.alloc(Math.max(0, length - 6), 1)])
const picture = (bytes, type = "image/gif", extra = {}) => new Response(bytes, { status: 200, headers: { "content-type": type, ...extra } })

// ── Fixtures in the shape each provider documents ──────────────────────────────────────────────────────────────────

function giphyGif(id, sizes = {}) {
  const rendition = (name, size, width = "480", height = "360") => ({
    url: `https://media2.giphy.com/media/${id}/${name}.gif?cid=abc&ep=v1_gifs_search`,
    width,
    height,
    size: String(size),
  })
  return {
    id,
    title: `Title of ${id} GIF`,
    alt_text: "",
    images: {
      original: rendition("giphy", sizes.original ?? 6_000_000),
      downsized_large: rendition("giphy-downsized-large", sizes.downsized_large ?? 7_000_000),
      downsized_medium: rendition("giphy-downsized-medium", sizes.downsized_medium ?? 5_200_000),
      downsized: rendition("giphy-downsized", sizes.downsized ?? 1_900_000),
      fixed_height: rendition("200", sizes.fixed_height ?? 900_000, "267", "200"),
      fixed_width: {
        ...rendition("200w", sizes.fixed_width ?? 800_000, "200", "150"),
        webp: `https://media2.giphy.com/media/${id}/200w.webp?cid=abc`,
      },
      fixed_width_still: { url: `https://media2.giphy.com/media/${id}/200w_s.gif?cid=abc`, width: "200", height: "150" },
    },
  }
}

const giphyPage = (items, pagination = { total_count: 100, count: items.length, offset: 0 }) => ({
  data: items,
  pagination,
  meta: { status: 200, msg: "OK", response_id: "r1" },
})

function klipyGif(slug, sizes = {}) {
  const format = (name, size, width = 498, height = 498) => ({ url: `https://static.klipy.com/ii/hash/${slug}-${name}`, width, height, size })
  return {
    id: 8041071659142944,
    slug,
    title: `Title of ${slug}`,
    type: "gif",
    file: {
      hd: { gif: format("hd.gif", sizes.hd ?? 5_000_000), webp: format("hd.webp", 285_228), jpg: format("hd.jpg", 19_255) },
      md: { gif: format("md.gif", sizes.md ?? 4_500_000), webp: format("md.webp", 643_490), jpg: format("md.jpg", 20_086) },
      sm: { gif: format("sm.gif", sizes.sm ?? 314_884, 220, 220), webp: format("sm.webp", 80_118, 220, 220), jpg: format("sm.jpg", 8_560, 220, 220) },
      xs: { gif: format("xs.gif", sizes.xs ?? 71_468, 90, 90), webp: format("xs.webp", 25_340, 90, 90), jpg: format("xs.jpg", 2_949, 90, 90) },
    },
  }
}

const klipyPage = (items, over = {}) => ({ result: true, data: { data: items, current_page: 1, per_page: 24, has_next: true, ...over } })

// ── Setup ──────────────────────────────────────────────────────────────────────────────────────────────────────────

test("GIF search is off without a key, and without a provider that is known", () => {
  assert.equal(gifSetup({}), null)
  assert.equal(gifSetup({ RHENKO_GIF_PROVIDER: "giphy" }), null)
  assert.equal(gifSetup({ RHENKO_GIF_PROVIDER: "giphy", RHENKO_GIF_API_KEY: "   " }), null)
  assert.equal(gifSetup({ RHENKO_GIF_API_KEY: KEY }), null)
  assert.equal(gifSetup({ RHENKO_GIF_PROVIDER: "constructor", RHENKO_GIF_API_KEY: KEY }), null)
  assert.equal(gifSetup({ RHENKO_GIF_PROVIDER: "tenor", RHENKO_GIF_API_KEY: KEY }), null)
})

test("the provider name is read without regard to case, and the key without its spaces", () => {
  const setup = gifSetup({ RHENKO_GIF_PROVIDER: " GiPhY ", RHENKO_GIF_API_KEY: `  ${KEY}  ` })
  assert.equal(setup?.provider.id, "giphy")
  assert.equal(setup?.key, KEY)
  assert.equal(gifSetup(KLIPY)?.provider.id, "klipy")
})

test("what the browser is told never includes the key", () => {
  const off = publicGifSetup({}, () => {})
  assert.deepEqual(off, { enabled: false })
  const on = publicGifSetup(KLIPY, () => {})
  assert.equal(on.enabled, true)
  assert.equal(on.placeholder, "Search KLIPY")
  assert.equal(on.poweredBy, "Powered by KLIPY")
  assert.equal(JSON.stringify(on).includes(KEY), false)
  assert.equal(publicGifSetup(GIPHY, () => {}).poweredBy, "Powered by GIPHY")
})

test("a key with an unusable provider turns the feature off and says why, once", () => {
  const said = []
  assert.deepEqual(publicGifSetup({ RHENKO_GIF_PROVIDER: "tenor", RHENKO_GIF_API_KEY: KEY }, (m) => said.push(m)), { enabled: false })
  assert.deepEqual(publicGifSetup({ RHENKO_GIF_PROVIDER: "tenor", RHENKO_GIF_API_KEY: KEY }, (m) => said.push(m)), { enabled: false })
  assert.equal(said.length, 1)
  assert.match(said[0], /Tenor/)
  assert.match(said[0], /shut down/)
  publicGifSetup({ RHENKO_GIF_PROVIDER: "bing", RHENKO_GIF_API_KEY: KEY }, (m) => said.push(m))
  assert.equal(said.length, 2)
  assert.match(said[1], /giphy or klipy/)
  // No key means nobody asked for GIFs, so there is nothing to explain.
  publicGifSetup({ RHENKO_GIF_PROVIDER: "nope" }, (m) => said.push(m))
  assert.equal(said.length, 2)
})

test("without a key, a search, a pick and a preview are refused and nothing is sent anywhere", async () => {
  const fetchImpl = mockFetch(() => json({}))
  const search = await searchGifs({ query: "cats" }, { env: {}, fetch: fetchImpl })
  assert.equal(search.ok, false)
  assert.equal(search.status, 503)
  assert.match(search.error, /isn't set up/)
  const pick = await fetchGifFile("abc123", { maxBytes: FOUR_MB }, { env: { RHENKO_GIF_PROVIDER: "giphy" }, fetch: fetchImpl })
  assert.equal(pick.ok, false)
  assert.equal(pick.status, 503)
  const preview = await fetchGifPreview("https://media1.giphy.com/media/x/200w.gif", { env: {}, fetch: fetchImpl })
  assert.equal(preview.ok, false)
  assert.equal(preview.status, 503)
  assert.equal(fetchImpl.calls.length, 0)
})

// ── The request each provider is sent ──────────────────────────────────────────────────────────────────────────────

test("GIPHY: a query is a search, and no query is trending, both with the key, the page size and a teen rating", async () => {
  const fetchImpl = mockFetch(() => json(giphyPage([giphyGif("aaa")])))
  await searchGifs({ query: "happy dance" }, { env: GIPHY, fetch: fetchImpl })
  const search = new URL(fetchImpl.calls[0])
  assert.equal(search.origin, "https://api.giphy.com")
  assert.equal(search.pathname, "/v1/gifs/search")
  assert.equal(search.searchParams.get("api_key"), KEY)
  assert.equal(search.searchParams.get("q"), "happy dance")
  assert.equal(search.searchParams.get("limit"), String(GIF_PAGE_SIZE))
  assert.equal(search.searchParams.get("offset"), "0")
  assert.equal(search.searchParams.get("rating"), "pg-13")

  await searchGifs({ query: "" }, { env: GIPHY, fetch: fetchImpl })
  const trending = new URL(fetchImpl.calls[1])
  assert.equal(trending.pathname, "/v1/gifs/trending")
  assert.equal(trending.searchParams.has("q"), false)
  assert.equal(trending.searchParams.get("rating"), "pg-13")

  await searchGifs({ query: "cats", cursor: "48" }, { env: GIPHY, fetch: fetchImpl })
  assert.equal(new URL(fetchImpl.calls[2]).searchParams.get("offset"), "48")
})

test("KLIPY: the key is in the path, a query is a search, and no query is trending", async () => {
  const fetchImpl = mockFetch(() => json(klipyPage([klipyGif("hello-hi-662")])))
  await searchGifs({ query: "hello there" }, { env: KLIPY, fetch: fetchImpl })
  const search = new URL(fetchImpl.calls[0])
  assert.equal(search.origin, "https://api.klipy.com")
  assert.equal(search.pathname, `/api/v1/${KEY}/gifs/search`)
  assert.equal(search.searchParams.get("q"), "hello there")
  assert.equal(search.searchParams.get("page"), "1")
  assert.equal(search.searchParams.get("per_page"), String(GIF_PAGE_SIZE))
  assert.equal(search.searchParams.get("content_filter"), "medium")
  assert.equal(search.searchParams.get("format_filter"), "gif,webp,jpg")
  // The viewer is not named to the provider.
  assert.equal(search.searchParams.has("customer_id"), false)

  await searchGifs({ query: "   " }, { env: KLIPY, fetch: fetchImpl })
  const trending = new URL(fetchImpl.calls[1])
  assert.equal(trending.pathname, `/api/v1/${KEY}/gifs/trending`)
  assert.equal(trending.searchParams.has("q"), false)

  await searchGifs({ query: "cats", cursor: "3" }, { env: KLIPY, fetch: fetchImpl })
  assert.equal(new URL(fetchImpl.calls[2]).searchParams.get("page"), "3")
})

test("a key with a slash in it cannot change the path of the request", async () => {
  const fetchImpl = mockFetch(() => json(klipyPage([])))
  await searchGifs({ query: "x" }, { env: { ...KLIPY, RHENKO_GIF_API_KEY: "a/b?c" }, fetch: fetchImpl })
  assert.equal(new URL(fetchImpl.calls[0]).pathname, "/api/v1/a%2Fb%3Fc/gifs/search")
})

test("a cursor from the browser is only a page number", async () => {
  const fetchImpl = mockFetch(() => json(giphyPage([])))
  await searchGifs({ query: "x", cursor: "../../etc" }, { env: GIPHY, fetch: fetchImpl })
  await searchGifs({ query: "x", cursor: "99999999" }, { env: GIPHY, fetch: fetchImpl })
  assert.equal(new URL(fetchImpl.calls[0]).searchParams.get("offset"), "0")
  assert.equal(new URL(fetchImpl.calls[1]).searchParams.get("offset"), "0")
})

test("a query is cleaned and cut to 50 characters before it is sent", async () => {
  assert.equal(MAX_GIF_QUERY, 50)
  assert.equal(cleanGifQuery("  hello \n\t  world  "), "hello world")
  assert.equal(cleanGifQuery("a\u0000b\u007fc"), "a b c")
  assert.equal(cleanGifQuery(null), "")
  assert.equal([...cleanGifQuery("x".repeat(80))].length, 50)
  assert.equal([...cleanGifQuery("😀".repeat(80))].length, 50)
  const fetchImpl = mockFetch(() => json(giphyPage([])))
  await searchGifs({ query: "y".repeat(120) }, { env: GIPHY, fetch: fetchImpl })
  assert.equal(new URL(fetchImpl.calls[0]).searchParams.get("q").length, 50)
})

// ── What comes back ────────────────────────────────────────────────────────────────────────────────────────────────

test("GIPHY results become the panel's list: numbers, a small animated picture, a still, and the next page", async () => {
  const fetchImpl = mockFetch(() => json(giphyPage([giphyGif("aaa"), giphyGif("bbb")], { total_count: 100, count: 2, offset: 0 })))
  const result = await searchGifs({ query: "cats" }, { env: GIPHY, fetch: fetchImpl })
  assert.equal(result.ok, true)
  assert.equal(result.gifs.length, 2)
  assert.deepEqual(result.gifs[0], {
    id: "aaa",
    title: "Title of aaa GIF",
    width: 200,
    height: 150,
    preview: "https://media2.giphy.com/media/aaa/200w.webp?cid=abc",
    still: "https://media2.giphy.com/media/aaa/200w_s.gif?cid=abc",
  })
  assert.equal(result.next, "2")
  // The file list used for the pick is not part of what the browser gets.
  assert.equal("files" in result.gifs[0], false)
})

test("GIPHY: the last page has no next, and an item without pictures is left out", async () => {
  const broken = { id: "zzz", title: "no images" }
  const fetchImpl = mockFetch(() => json(giphyPage([giphyGif("aaa"), broken], { total_count: 2, count: 2, offset: 0 })))
  const result = await searchGifs({ query: "cats" }, { env: GIPHY, fetch: fetchImpl })
  assert.equal(result.ok, true)
  assert.deepEqual(result.gifs.map((g) => g.id), ["aaa"])
  assert.equal(result.next, null)
})

test("GIPHY: the description is used as the title when there is one", async () => {
  const described = giphyGif("aaa")
  described.alt_text = "a cat jumping into a box"
  const result = await searchGifs({ query: "x" }, { env: GIPHY, fetch: mockFetch(() => json(giphyPage([described]))) })
  assert.equal(result.gifs[0].title, "a cat jumping into a box")
})

test("GIPHY's 200 with an empty response id is an error, not an empty search", async () => {
  const body = { data: [], pagination: { total_count: 0, count: 0, offset: 0 }, meta: { status: 200, msg: "OK", response_id: "" } }
  const result = await searchGifs({ query: "x" }, { env: GIPHY, fetch: mockFetch(() => json(body)) })
  assert.equal(result.ok, false)
  assert.equal(result.status, 502)
})

test("KLIPY results become the panel's list: the slug is the id, with a small animated picture, a still, and the next page", async () => {
  const ad = { type: "ad", content: "<script>" }
  const fetchImpl = mockFetch(() => json(klipyPage([klipyGif("hello-hi-662"), ad, klipyGif("wave-1")], { current_page: 2, has_next: true })))
  const result = await searchGifs({ query: "hi" }, { env: KLIPY, fetch: fetchImpl })
  assert.equal(result.ok, true)
  assert.deepEqual(result.gifs.map((g) => g.id), ["hello-hi-662", "wave-1"])
  assert.deepEqual(result.gifs[0], {
    id: "hello-hi-662",
    title: "Title of hello-hi-662",
    width: 220,
    height: 220,
    preview: "https://static.klipy.com/ii/hash/hello-hi-662-sm.webp",
    still: "https://static.klipy.com/ii/hash/hello-hi-662-sm.jpg",
  })
  assert.equal(result.next, "3")
  const last = await searchGifs({ query: "hi" }, { env: KLIPY, fetch: mockFetch(() => json(klipyPage([klipyGif("a")], { has_next: false }))) })
  assert.equal(last.next, null)
})

test("a picture that is not on the provider's own domain drops the GIF from the list", async () => {
  const stray = giphyGif("evil")
  stray.images.fixed_width.webp = "https://evil.example/200w.webp"
  const result = await searchGifs({ query: "x" }, { env: GIPHY, fetch: mockFetch(() => json(giphyPage([stray, giphyGif("fine")]))) })
  assert.deepEqual(result.gifs.map((g) => g.id), ["fine"])
})

test("provider failures become plain messages, and the key is never in them or in the log", async () => {
  logged.length = 0
  const busy = await searchGifs({ query: "x" }, { env: GIPHY, fetch: mockFetch(() => json({}, 429)) })
  assert.equal(busy.ok, false)
  assert.equal(busy.status, 429)
  for (const status of [401, 403, 500]) {
    const refused = await searchGifs({ query: "x" }, { env: KLIPY, fetch: mockFetch(() => json({}, status)) })
    assert.equal(refused.ok, false)
    assert.equal(refused.status, 502)
    assert.equal(refused.error.includes(KEY), false)
  }
  const down = await searchGifs({ query: "x" }, { env: GIPHY, fetch: mockFetch(() => Promise.reject(new TypeError(`fetch failed for https://api.giphy.com/?api_key=${KEY}`))) })
  assert.equal(down.ok, false)
  assert.equal(down.status, 502)
  const garbled = await searchGifs({ query: "x" }, { env: KLIPY, fetch: mockFetch(() => new Response("<html>", { status: 200 })) })
  assert.equal(garbled.ok, false)
  const shapeless = await searchGifs({ query: "x" }, { env: KLIPY, fetch: mockFetch(() => json({ result: true, data: {} })) })
  assert.equal(shapeless.ok, false)
  assert.ok(logged.length >= 5)
  assert.equal(logged.some((line) => line.includes(KEY)), false)
})

// ── Choosing a GIF: the size limit ─────────────────────────────────────────────────────────────────────────────────

// A mock of the provider: its item answer, and what its CDN serves at each address.
function provider(item, files = {}) {
  return mockFetch((url) => {
    if (url.startsWith("https://api.giphy.com/v1/gifs/")) return json({ data: item, meta: { status: 200, response_id: "r" } })
    if (url.startsWith("https://api.klipy.com/")) return json({ result: true, data: { data: [item] } })
    const serve = files[url]
    return serve ? serve() : new Response("not found", { status: 404 })
  })
}

test("GIPHY: the biggest size that fits the limit is the one downloaded", async () => {
  const item = giphyGif("aaa", { original: 6_000_000, downsized_large: 7_000_000, downsized_medium: 5_200_000, downsized: 1_900_000 })
  const wanted = item.images.downsized.url
  const fetchImpl = provider(item, { [wanted]: () => picture(gifBytes(1_900_000)) })
  const result = await fetchGifFile("aaa", { maxBytes: FOUR_MB }, { env: GIPHY, fetch: fetchImpl })
  assert.equal(result.ok, true)
  assert.equal(result.size, 1_900_000)
  assert.equal(result.source, wanted)
  assert.equal(result.title, "Title of aaa GIF")
  // The sizes the provider lists as too big are never downloaded.
  assert.deepEqual(fetchImpl.calls.map((u) => new URL(u).pathname.split("/").pop()), ["aaa", "giphy-downsized.gif"])
  // The item request asks for the rating limit too, so an id typed by hand cannot reach an adult GIF.
  assert.equal(new URL(fetchImpl.calls[0]).searchParams.get("rating"), "pg-13")
})

test("GIPHY: the original is used when it fits", async () => {
  const item = giphyGif("aaa", { original: 3_000_000 })
  const fetchImpl = provider(item, { [item.images.original.url]: () => picture(gifBytes(3_000_000)) })
  const result = await fetchGifFile("aaa", { maxBytes: FOUR_MB }, { env: GIPHY, fetch: fetchImpl })
  assert.equal(result.ok, true)
  assert.equal(result.source, item.images.original.url)
})

test("KLIPY: the item is asked for by its slug and the biggest GIF that fits is downloaded", async () => {
  const item = klipyGif("hello-hi-662", { hd: 5_000_000, md: 4_500_000, sm: 314_884 })
  const fetchImpl = provider(item, { [item.file.sm.gif.url]: () => picture(gifBytes(314_884)) })
  const result = await fetchGifFile("hello-hi-662", { maxBytes: FOUR_MB }, { env: KLIPY, fetch: fetchImpl })
  assert.equal(result.ok, true)
  assert.equal(result.source, item.file.sm.gif.url)
  const asked = new URL(fetchImpl.calls[0])
  assert.equal(asked.pathname, `/api/v1/${KEY}/gifs/items`)
  assert.equal(asked.searchParams.get("slugs"), "hello-hi-662")
})

test("a size that is bigger than the provider said is dropped part way, and the next one is tried", async () => {
  const item = giphyGif("aaa", { original: 3_000_000, downsized_large: 9_000_000, downsized_medium: 9_000_000, downsized: 1_000_000 })
  let readLarge = 0
  const fetchImpl = provider(item, {
    // Listed as 3 MB, but it is 5 MB.
    [item.images.original.url]: () => {
      readLarge += 1
      return picture(gifBytes(5 * 1024 * 1024))
    },
    [item.images.downsized.url]: () => picture(gifBytes(1_000_000)),
  })
  const result = await fetchGifFile("aaa", { maxBytes: FOUR_MB }, { env: GIPHY, fetch: fetchImpl })
  assert.equal(readLarge, 1)
  assert.equal(result.ok, true)
  assert.equal(result.source, item.images.downsized.url)
})

test("a size whose header says it is too big is not read at all", async () => {
  const item = giphyGif("aaa", { original: 1_000, downsized_large: 9_000_000, downsized_medium: 9_000_000, downsized: 1_000 })
  let bodyRead = false
  const fetchImpl = provider(item, {
    [item.images.original.url]: () => {
      // A stream that holds nothing back: it is asked for data only when someone reads.
      const body = new ReadableStream(
        {
          pull(controller) {
            bodyRead = true
            controller.enqueue(new Uint8Array(10))
          },
        },
        { highWaterMark: 0 }
      )
      return new Response(body, { status: 200, headers: { "content-type": "image/gif", "content-length": String(10 * FOUR_MB) } })
    },
    [item.images.downsized.url]: () => picture(gifBytes(1_000)),
  })
  const result = await fetchGifFile("aaa", { maxBytes: FOUR_MB }, { env: GIPHY, fetch: fetchImpl })
  assert.equal(result.ok, true)
  assert.equal(bodyRead, false)
  assert.equal(result.source, item.images.downsized.url)
})

test("when no size fits, the pick is refused with a message that says so", async () => {
  const item = giphyGif("aaa", { original: 9_000_000, downsized_large: 9_000_000, downsized_medium: 9_000_000, downsized: 5_000_000, fixed_height: 4_500_000, fixed_width: 4_300_000 })
  delete item.images.fixed_height
  const fetchImpl = provider(item)
  const result = await fetchGifFile("aaa", { maxBytes: FOUR_MB }, { env: GIPHY, fetch: fetchImpl })
  assert.equal(result.ok, false)
  assert.equal(result.status, 413)
  assert.match(result.error, /over 4 MB/)
  assert.match(result.error, /Pick another/)
  // Nothing was downloaded: the item answer was the only request.
  assert.equal(fetchImpl.calls.length, 1)
})

test("a file that is not a GIF is not accepted, and a smaller size is tried", async () => {
  const item = giphyGif("aaa", { original: 1_000, downsized_large: 9_000_000, downsized_medium: 9_000_000, downsized: 2_000 })
  const notAGif = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100)])
  const fetchImpl = provider(item, {
    [item.images.original.url]: () => picture(notAGif),
    [item.images.downsized.url]: () => picture(gifBytes(2_000)),
  })
  const result = await fetchGifFile("aaa", { maxBytes: FOUR_MB }, { env: GIPHY, fetch: fetchImpl })
  assert.equal(result.ok, true)
  assert.equal(result.source, item.images.downsized.url)

  const onlyNotAGif = provider(giphyGif("bbb", { original: 1_000, downsized_large: 9_000_000, downsized_medium: 9_000_000, downsized: 9_000_000 }), {})
  const failed = await fetchGifFile("bbb", { maxBytes: FOUR_MB }, { env: GIPHY, fetch: onlyNotAGif })
  assert.equal(failed.ok, false)
})

test("at most three downloads are tried for one pick", async () => {
  const item = giphyGif("aaa", { original: 1_000, downsized_large: 1_000, downsized_medium: 1_000, downsized: 1_000, fixed_height: 1_000, fixed_width: 1_000 })
  const fetchImpl = provider(item, {})
  const result = await fetchGifFile("aaa", { maxBytes: FOUR_MB }, { env: GIPHY, fetch: fetchImpl })
  assert.equal(result.ok, false)
  assert.equal(result.status, 502)
  // The item request, then three downloads that each answered 404.
  assert.equal(fetchImpl.calls.length, 4)
})

test("a file address off the provider's domain is never fetched, and neither is a redirect to one", async () => {
  const item = giphyGif("aaa", { original: 1_000, downsized_large: 9_000_000, downsized_medium: 9_000_000, downsized: 2_000 })
  item.images.original.url = "https://evil.example/giphy.gif"
  const redirected = item.images.downsized.url
  const fetchImpl = provider(item, {
    [redirected]: () => new Response(null, { status: 302, headers: { location: "https://evil.example/steal.gif" } }),
  })
  const result = await fetchGifFile("aaa", { maxBytes: FOUR_MB }, { env: GIPHY, fetch: fetchImpl })
  assert.equal(result.ok, false)
  assert.equal(fetchImpl.calls.some((u) => u.includes("evil.example")), false)
})

test("a redirect inside the provider's domain is followed", async () => {
  const item = giphyGif("aaa", { original: 1_000 })
  const fetchImpl = provider(item, {
    [item.images.original.url]: () => new Response(null, { status: 302, headers: { location: "https://media3.giphy.com/media/aaa/moved.gif" } }),
    "https://media3.giphy.com/media/aaa/moved.gif": () => picture(gifBytes(1_000)),
  })
  const result = await fetchGifFile("aaa", { maxBytes: FOUR_MB }, { env: GIPHY, fetch: fetchImpl })
  assert.equal(result.ok, true)
})

test("an id that could not be the provider's is refused before anything is sent", async () => {
  const fetchImpl = mockFetch(() => json({}))
  for (const id of ["", "../../v1/gifs/search", "a b", "x".repeat(200), "a?b=c"]) {
    const result = await fetchGifFile(id, { maxBytes: FOUR_MB }, { env: GIPHY, fetch: fetchImpl })
    assert.equal(result.ok, false)
    assert.equal(result.status, 400)
  }
  const klipy = await fetchGifFile("hello/../x", { maxBytes: FOUR_MB }, { env: KLIPY, fetch: fetchImpl })
  assert.equal(klipy.ok, false)
  assert.equal(fetchImpl.calls.length, 0)
})

test("a GIF the provider no longer has is reported as gone", async () => {
  const gone = await fetchGifFile("aaa", { maxBytes: FOUR_MB }, { env: GIPHY, fetch: mockFetch(() => json({ meta: { status: 404 } }, 404)) })
  assert.equal(gone.ok, false)
  assert.equal(gone.status, 404)
  const empty = await fetchGifFile("aaa", { maxBytes: FOUR_MB }, { env: GIPHY, fetch: mockFetch(() => json({ data: {}, meta: { status: 200 } })) })
  assert.equal(empty.ok, false)
  assert.equal(empty.status, 404)
})

// ── Pictures for the grid, and addresses from the browser ──────────────────────────────────────────────────────────

test("only https addresses on the provider's own domain are fetched for the grid", async () => {
  const giphy = gifSetup(GIPHY).provider
  assert.equal(isGifCdnUrl(giphy, "https://media0.giphy.com/media/x/200w.webp"), true)
  assert.equal(isGifCdnUrl(giphy, "https://i.giphy.com/x.gif"), true)
  assert.equal(isGifCdnUrl(giphy, "http://media0.giphy.com/media/x/200w.webp"), false)
  assert.equal(isGifCdnUrl(giphy, "https://giphy.com.evil.example/x.gif"), false)
  assert.equal(isGifCdnUrl(giphy, "https://evil.example/giphy.com/x.gif"), false)
  assert.equal(isGifCdnUrl(giphy, "https://notgiphy.com/x.gif"), false)
  assert.equal(isGifCdnUrl(giphy, "https://user@media0.giphy.com/x.gif"), false)
  assert.equal(isGifCdnUrl(giphy, "https://media0.giphy.com:8443/x.gif"), false)
  assert.equal(isGifCdnUrl(giphy, "https://static.klipy.com/x.gif"), false)
  assert.equal(isGifCdnUrl(giphy, "javascript:alert(1)"), false)
  assert.equal(isGifCdnUrl(giphy, ""), false)
  assert.equal(isGifCdnUrl(gifSetup(KLIPY).provider, "https://static2.klipy.com/ii/x.webp"), true)
})

test("the link the browser uses for a picture goes through this server", () => {
  const link = previewPath("https://media1.giphy.com/media/x/200w.webp?cid=a&ep=b")
  assert.ok(link.startsWith("/api/gifs/preview?u="))
  assert.equal(new URL(link, "https://rhenko.test").searchParams.get("u"), "https://media1.giphy.com/media/x/200w.webp?cid=a&ep=b")
})

test("a preview comes back only for a small picture on the provider's domain", async () => {
  const url = "https://media1.giphy.com/media/x/200w.webp"
  const ok = await fetchGifPreview(url, { env: GIPHY, fetch: mockFetch(() => picture(Buffer.alloc(5_000), "image/webp")) })
  assert.equal(ok.ok, true)
  assert.equal(ok.type, "image/webp")
  assert.equal(ok.bytes.length, 5_000)

  const offSite = mockFetch(() => picture(Buffer.alloc(10), "image/webp"))
  const refused = await fetchGifPreview("https://evil.example/x.webp", { env: GIPHY, fetch: offSite })
  assert.equal(refused.ok, false)
  assert.equal(refused.status, 400)
  assert.equal(offSite.calls.length, 0)

  const page = await fetchGifPreview(url, { env: GIPHY, fetch: mockFetch(() => picture("<script>alert(1)</script>", "text/html")) })
  assert.equal(page.ok, false)
  const huge = await fetchGifPreview(url, { env: GIPHY, fetch: mockFetch(() => picture(Buffer.alloc(2_000_000), "image/webp")) })
  assert.equal(huge.ok, false)
  const missing = await fetchGifPreview(url, { env: GIPHY, fetch: mockFetch(() => new Response("no", { status: 404 })) })
  assert.equal(missing.ok, false)
})
