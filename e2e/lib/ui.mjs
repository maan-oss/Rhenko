// Small helpers for driving the pages: waiting for hydration, for a server action to answer, and for a toast.
import { randomUUID } from "node:crypto"
import { TIMEOUT, randomWord, sleep } from "./env.mjs"

// A handle and an id that belong to no record: what an unknown address should look like to everyone.
export function missingHandle() {
  return `nobody${randomWord(8, "abcdefghijklmnopqrstuvwxyz")}`
}

export function missingId() {
  return randomUUID()
}

// Waits until a locator matches nothing. A page that just changed can still show what it showed a moment ago, so a
// count taken at once can be stale. Resolves with the last count, which the caller asserts on.
export async function gone(locator, { timeout = TIMEOUT } = {}) {
  const deadline = Date.now() + timeout
  for (;;) {
    const count = await locator.count()
    if (count === 0 || Date.now() > deadline) return count
    await sleep(200)
  }
}

// Opens a path that must not be visible to this viewer, and returns the HTTP status the server answered with. The page
// shows the same "This page is not here" screen whether the record is missing, private, blocked or deleted.
export async function notHere(page, path) {
  const response = await page.goto(path, { waitUntil: "domcontentloaded" })
  await page.getByRole("heading", { name: "This page is not here" }).waitFor()
  return response?.status()
}

// Waits until React has taken over an element. A click or a typed value before that point is lost.
export async function ready(locator) {
  const handle = await locator.first().elementHandle({ timeout: TIMEOUT })
  try {
    await locator.page().waitForFunction((el) => Object.keys(el).some((key) => key.startsWith("__reactProps$")), handle, { timeout: TIMEOUT })
  } finally {
    await handle.dispose()
  }
}

// Opens a path and waits for the first thing that proves the page is there (a locator, once it is hydrated).
export async function go(page, path, readyLocator) {
  const response = await page.goto(path, { waitUntil: "domcontentloaded" })
  if (readyLocator) {
    await readyLocator.first().waitFor()
    await ready(readyLocator)
  }
  return response
}

// Waits until the page's live event stream is open. From then on the server pushes banners, messages and calls to this
// page. The stream starts a moment after the page is ready, and anything sent before it opens is never delivered.
export async function streamOpen(page) {
  await page.waitForFunction(() => (window.__rhenkoStreams ?? []).some((source) => source.readyState === 1), null, { timeout: TIMEOUT })
}

// Runs `trigger` (a click or a key press) and waits for the server action it starts to answer.
// Server actions are POSTs that carry a Next-Action header.
export async function acted(page, trigger, { timeout = TIMEOUT } = {}) {
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && r.request().headers()["next-action"] !== undefined, { timeout }),
    trigger(),
  ])
  // React needs a moment to show what the action returned.
  await sleep(120)
  return response
}

// The text of the first toast that matches, waiting for it to show up.
export async function toastText(page, match, { timeout = TIMEOUT } = {}) {
  const toast = page.locator("[data-sonner-toast]").filter({ hasText: match }).first()
  await toast.waitFor({ timeout })
  return (await toast.innerText()).replace(/\s+/g, " ").trim()
}

// The text of the first alert inside a form or dialog, waiting for one to exist.
export async function alertText(scope, { timeout = TIMEOUT, match } = {}) {
  let alerts = scope.locator('[role="alert"]')
  if (match) alerts = alerts.filter({ hasText: match })
  const alert = alerts.first()
  await alert.waitFor({ timeout })
  return (await alert.innerText()).replace(/\s+/g, " ").trim()
}

// The body text of the page, trimmed.
export async function bodyText(page) {
  return (await page.locator("body").innerText()).replace(/\s+/g, " ").trim()
}

// The form that holds a button. Several settings forms share field names (password, code), so they are told apart
// by the button that sends them.
export function formWithButton(scope, buttonName) {
  return scope.locator("form").filter({ has: scope.getByRole("button", { name: buttonName, exact: true }) })
}

// Fills the field of a form by its name and waits for the page to be hydrated first, since a value typed before that is lost.
export async function fillField(form, name, value) {
  const input = form.locator(`input[name=${name}]`)
  await ready(input)
  await input.fill(value)
}

// The brightness (0 black, 255 white) of the colour behind the page. Used to tell the light theme from the dark one.
export function pageBrightness(page) {
  return page.evaluate(() => {
    const clear = (value) => value === "transparent" || /rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\s*\)/.test(value)
    for (const el of [document.body, document.documentElement]) {
      const value = getComputedStyle(el).backgroundColor
      if (clear(value)) continue
      const [r, g, b] = value.match(/\d+(\.\d+)?/g).map(Number)
      return Math.round(0.299 * r + 0.587 * g + 0.114 * b)
    }
    return 255
  })
}
