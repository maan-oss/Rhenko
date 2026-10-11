// Live news: the banners that appear over any page when something happens, brought by the event stream.
import { sleep } from "./env.mjs"
import { go, streamOpen } from "./ui.mjs"

// A page that is not a feed and not a conversation, so only the live event stream can tell its owner anything new.
// It returns once that stream is open, so whatever the other person does next reaches this page.
export async function idleOnSettings(page) {
  await go(page, "/settings", page.getByRole("navigation", { name: "Settings sections" }))
  await streamOpen(page)
}

// A banner that says `wording`, in the live banner area.
export function bannerWith(page, wording) {
  return page.locator('[aria-live="polite"] button').filter({ hasText: wording }).first()
}

// Starts waiting for a banner and returns a promise of true or false, so the wait can cover the action that causes it.
export function expectBanner(page, wording, timeout = 12_000) {
  return bannerWith(page, wording)
    .waitFor({ timeout })
    .then(
      () => true,
      () => false
    )
}

// A banner closes on its own after six seconds, so "no banner came" cannot be judged by looking at one moment.
// This keeps a log inside the page of every banner text that ever showed, from now until the page navigates away.
export async function recordBanners(page) {
  await page.evaluate(() => {
    window.__bannerLog = []
    const seen = new Set()
    const look = () => {
      for (const button of document.querySelectorAll('[aria-live="polite"] button')) {
        const text = (button.textContent || "").replace(/\s+/g, " ").trim()
        if (text && !seen.has(text)) {
          seen.add(text)
          window.__bannerLog.push(text)
        }
      }
    }
    new MutationObserver(look).observe(document.body, { childList: true, subtree: true, characterData: true })
    look()
  })
}

// Every banner text logged since recordBanners, oldest first.
export function bannersSeen(page) {
  return page.evaluate(() => window.__bannerLog ?? [])
}

// Waits until the log holds a banner that matches `wording` (a string or a pattern). Resolves to the banner text, or null when
// the time runs out.
export async function sawBanner(page, wording, timeout = 12_000) {
  const matches = (text) => (typeof wording === "string" ? text.includes(wording) : wording.test(text))
  const end = Date.now() + timeout
  for (;;) {
    const found = (await bannersSeen(page)).find(matches)
    if (found) return found
    if (Date.now() >= end) return null
    await sleep(250)
  }
}
