// Watches every page the suite opens: uncaught page errors, console errors, and sideways overflow.
// Nothing is thrown from here. Problems are collected, and the check that was running when one showed up reports it.
import path from "node:path"
import fs from "node:fs"
import { OUT, slug, sleep } from "./env.mjs"

const state = {
  // Known benign messages, set once by run.mjs. Each one has the reason it is safe to skip.
  noise: [],
  // Pages that are open right now.
  pages: new Set(),
  // Everything found so far, in order. A check reads the part that is new since it began.
  problems: [],
  seen: new Set(),
  ignoredCount: new Map(),
}

// How long a page gets to settle after it navigates before the width is measured.
const SETTLE_MS = 900

export function configureNoise(list) {
  state.noise = list
}

// A rule that applies only while one check runs. It returns the function that takes the rule out again, so it covers nothing
// that the check did not ask for.
export function allowNoise(rule) {
  state.noise = [...state.noise, rule]
  return () => {
    state.noise = state.noise.filter((item) => item !== rule)
  }
}

export function noiseTally() {
  return [...state.ignoredCount.entries()].map(([id, count]) => ({ id, count }))
}

export function problemMark() {
  return state.problems.length
}

export function problemsSince(mark) {
  return state.problems.slice(mark)
}

function pathOf(url) {
  try {
    const parsed = new URL(url)
    return parsed.pathname + (parsed.search ? "?…" : "")
  } catch {
    return url
  }
}

function addProblem(kind, entry, text, extra = {}) {
  const url = entry.page.url()
  const key = `${kind}|${entry.viewportName}|${pathOf(url)}|${text.slice(0, 200)}`
  if (state.seen.has(key)) return
  state.seen.add(key)
  state.problems.push({ kind, label: entry.label, viewport: entry.viewportName, url, text, ...extra })
}

function ignored(kind, text, resourceUrl) {
  for (const rule of state.noise) {
    if (rule.kind !== kind) continue
    if (!rule.text.test(text)) continue
    if (rule.url && !rule.url.test(resourceUrl || "")) continue
    state.ignoredCount.set(rule.id, (state.ignoredCount.get(rule.id) || 0) + 1)
    return true
  }
  return false
}

// Reads the page's width. Returns null when nothing sticks out.
async function measure(page, expectedWidth) {
  return page.evaluate((expected) => {
    if (document.contentType !== "text/html" || !document.body) return null
    const root = document.documentElement
    const info = { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth, innerWidth: window.innerWidth, offenders: [] }
    const wide = root.scrollWidth > root.clientWidth
    const notDeviceWidth = expected !== null && window.innerWidth > expected + 1
    if (!wide && !notDeviceWidth) return null
    for (const el of document.body.querySelectorAll("*")) {
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue
      if (rect.right > root.clientWidth + 1) {
        const name = el.tagName.toLowerCase() + (el.id ? `#${el.id}` : "") + (typeof el.className === "string" && el.className ? `.${el.className.trim().split(/\s+/).slice(0, 3).join(".")}` : "")
        info.offenders.push(`${name} right=${Math.round(rect.right)}`)
        if (info.offenders.length >= 4) break
      }
    }
    return info
  }, expectedWidth)
}

async function checkWidth(entry) {
  const { page } = entry
  if (page.isClosed()) return
  const url = page.url()
  if (!url || url === "about:blank") return
  let found = null
  // A page that is still moving to somewhere else loses its context. Try once more before giving up.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      found = await measure(page, entry.phone ? entry.width : null)
      break
    } catch {
      if (page.isClosed()) return
      await sleep(350)
    }
  }
  if (!found) return
  const tooWide = found.scrollWidth > found.clientWidth
  const text = tooWide
    ? `page is wider than the screen: scrollWidth ${found.scrollWidth} > clientWidth ${found.clientWidth}; sticking out: ${found.offenders.join(", ") || "nothing measurable"}`
    : `phone layout is not using the device width: innerWidth ${found.innerWidth}`
  addProblem("overflow", entry, text)
}

function schedule(entry) {
  if (entry.timer) clearTimeout(entry.timer)
  entry.dueAt = Date.now() + SETTLE_MS
  entry.timer = setTimeout(() => {
    entry.timer = null
    entry.running = checkWidth(entry).finally(() => {
      entry.running = null
    })
  }, SETTLE_MS)
}

// Starts watching a page. `viewport` is { name, width, phone }.
export function watchPage(page, label, viewport) {
  const entry = {
    page,
    label,
    viewportName: viewport.name,
    width: viewport.width,
    phone: viewport.phone,
    timer: null,
    dueAt: 0,
    running: null,
  }
  state.pages.add(entry)
  page.on("close", () => {
    if (entry.timer) clearTimeout(entry.timer)
    state.pages.delete(entry)
  })
  page.on("pageerror", (error) => {
    const text = String(error && error.message ? error.message : error).split("\n")[0].slice(0, 400)
    if (ignored("pageerror", text, "")) return
    addProblem("pageerror", entry, text)
  })
  page.on("console", (message) => {
    if (message.type() !== "error") return
    const text = message.text().split("\n")[0].slice(0, 400)
    const where = message.location() && message.location().url ? message.location().url : ""
    if (ignored("console", text, where)) return
    addProblem("console", entry, where ? `${text} (${pathOf(where)})` : text)
  })
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) schedule(entry)
  })
  return entry
}

// Measures every page that has a pending width check right now, instead of waiting for the timer.
export async function settleWatchers() {
  const waiting = []
  for (const entry of state.pages) {
    if (entry.timer) {
      clearTimeout(entry.timer)
      entry.timer = null
      const remaining = Math.max(0, entry.dueAt - Date.now())
      waiting.push(sleep(Math.min(remaining, 500)).then(() => checkWidth(entry)))
    } else if (entry.running) {
      waiting.push(entry.running)
    }
  }
  await Promise.all(waiting)
}

// Saves a picture of every open page, for a failed check.
export async function shootAll(name) {
  fs.mkdirSync(OUT, { recursive: true })
  const saved = []
  let index = 0
  for (const entry of state.pages) {
    if (entry.page.isClosed()) continue
    index += 1
    if (index > 4) break
    const file = path.join(OUT, `${slug(name)}-${index}-${slug(entry.label)}.png`)
    try {
      await entry.page.screenshot({ path: file, timeout: 6000 })
      saved.push(file)
    } catch {
      // A page that is closing or crashed cannot be photographed. The failure message still says what went wrong.
    }
  }
  return saved
}
