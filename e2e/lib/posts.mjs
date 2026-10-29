// Writing and finding posts. The composer on the home page is form#compose; the reply box on a post's own page is form#reply.
// The Reply and Quote dialogs hold the same composer without an id.
import { TIMEOUT, sleep } from "./env.mjs"
import { acted, go, ready, toastText } from "./ui.mjs"

export const COMPOSER_TEXT = "textarea[aria-label='Post text']"

export function homeComposer(page) {
  return page.locator("form#compose")
}

export async function openHome(page, tab) {
  await go(page, tab ? `/?tab=${tab}` : "/", homeComposer(page).locator(COMPOSER_TEXT))
}

export async function openProfile(page, handle, tab) {
  await go(page, tab ? `/${handle}?tab=${tab}` : `/${handle}`, page.getByRole("navigation", { name: "Profile sections" }))
}

// The post card (an article) that contains this text.
export function card(page, text) {
  return page.locator("article").filter({ hasText: text }).first()
}

// The id of the post a card shows, read from the link on its time.
export async function cardPostId(cardLocator) {
  const href = await cardLocator.locator('a[href*="/status/"]').first().getAttribute("href")
  const match = /\/status\/([^/?#]+)/.exec(href ?? "")
  if (!match) throw new Error(`the card has no link to its post (${href})`)
  return match[1]
}

// Fills the composer text and returns the form so the caller can press the right button.
export async function typeIn(form, text) {
  const box = form.locator(COMPOSER_TEXT)
  await ready(box)
  await box.fill(text)
  return box
}

// Posts text from the home page. Resolves once the server accepted it and the "Posted." toast showed.
export async function writePost(page, text) {
  await openHome(page)
  const form = homeComposer(page)
  await typeIn(form, text)
  await acted(page, () => form.getByRole("button", { name: "Post", exact: true }).click())
  await toastText(page, /^Posted\./)
}

// Attaches picture files to a composer.
// Attaches files to a composer. Each photo opens the framing step first, so it is kept as framed ("Use this") before
// the caller carries on. Videos and files that do not open it are left alone.
export async function attach(form, files) {
  await form.locator("input[type=file]").setInputFiles(files)
  const framing = form.page().getByRole("dialog", { name: "Frame your photo" })
  const count = Array.isArray(files) ? files.length : 1
  for (let i = 0; i < count; i++) {
    const open = await framing.first().waitFor({ state: "visible", timeout: 4000 }).then(() => true, () => false)
    if (!open) break
    await framing.first().getByRole("button", { name: "Use this", exact: true }).click()
    await framing.first().waitFor({ state: "detached" })
  }
}

export async function addAlt(form, text) {
  await form.getByRole("button", { name: /^(Add|Edit) alt text$/ }).first().click()
  await form.getByLabel(/Describe this for people/).fill(text)
}

// The composer's tools (poll, thread, schedule, photos) sit behind a plus. This opens them when they are shut.
export async function showTools(form) {
  const toggle = form.getByRole("button", { name: "Show the tools", exact: true })
  if (await toggle.count()) await toggle.first().click()
}

// Opens the poll box in a composer, fills the choices given, and picks a length when one is named.
export async function startPoll(form, options, length) {
  await showTools(form)
  await form.getByRole("button", { name: "Add a poll" }).click()
  const group = form.getByRole("group", { name: "Poll" })
  await group.waitFor()
  for (let i = 0; i < options.length; i++) {
    if (i >= 2) await group.getByRole("button", { name: "Add choice" }).click()
    await group.getByRole("textbox", { name: `Choice ${i + 1}` }).fill(options[i])
  }
  if (length) await group.locator("select").selectOption({ label: length })
}

// Fills one choice of a poll that is already open.
export async function fillChoice(form, number, text) {
  await form.getByRole("group", { name: "Poll" }).getByRole("textbox", { name: `Choice ${number}` }).fill(text)
}

// The Drafts page (or its Scheduled list), once its buttons work.
export async function openDrafts(page, tab) {
  await go(page, tab ? `/drafts?tab=${tab}` : "/drafts", page.getByRole("navigation", { name: "Sections" }))
}

// Opens the "More options" menu on a card and clicks one item.
export async function cardMenu(page, cardLocator, itemName) {
  await cardLocator.getByRole("button", { name: "More options" }).click()
  await page.getByRole("menuitem", { name: itemName }).click()
}

export function likeButton(cardLocator) {
  return cardLocator.getByRole("button", { name: /^(Like|Unlike), / })
}

export function bookmarkButton(cardLocator) {
  return cardLocator.getByRole("button", { name: /^(Bookmark|Remove bookmark)$/ })
}

export function replyButton(cardLocator) {
  return cardLocator.getByRole("button", { name: /^Reply, / })
}

export function repostTrigger(cardLocator) {
  return cardLocator.getByRole("button", { name: /^Repost, / })
}

// Waits for a post with this text to show on the page. Reloads now and then, for pages that do not update by themselves.
export async function waitForPost(page, text, { timeout = TIMEOUT, reload = false } = {}) {
  const end = Date.now() + timeout
  for (;;) {
    const found = page.locator("article").filter({ hasText: text }).first()
    try {
      await found.waitFor({ timeout: Math.min(4000, Math.max(500, end - Date.now())) })
      return found
    } catch (error) {
      if (Date.now() >= end) throw error
      if (reload) await page.reload({ waitUntil: "domcontentloaded" })
      await sleep(300)
    }
  }
}

// True if no card on the page carries this text (after waiting a moment for late content).
export async function noPost(page, text, wait = 2500) {
  await sleep(wait)
  return (await page.locator("article").filter({ hasText: text }).count()) === 0
}

// The search page for a query (and a tab: f=latest, f=media, f=people).
export async function openSearch(page, query, tab) {
  const suffix = tab ? `&f=${tab}` : ""
  await go(page, `/search?q=${encodeURIComponent(query)}${suffix}`, page.locator("input#search-q"))
}

// How many cards on the page carry this text.
export async function cardCount(page, text) {
  return page.locator("article").filter({ hasText: text }).count()
}
