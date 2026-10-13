// The settings pages: the list of sections, and the switches on them.
import { escapeRegExp } from "./env.mjs"
import { acted, go, ready, toastText } from "./ui.mjs"

// The sections in the order the Settings page lists them: the link text, the path, and one thing that proves the page is
// there and ready.
export const SECTIONS = [
  { title: "Appearance", path: "/settings/appearance", ready: (page) => page.getByRole("radiogroup", { name: "Theme" }) },
  { title: "Account", path: "/settings/account", ready: (page) => page.locator("#account-status") },
  { title: "Connections and languages", path: "/settings/connections", ready: (page) => page.locator("#where-area") },
  { title: "Security", path: "/settings/security", ready: (page) => page.locator("input[name=current]") },
  { title: "Privacy and safety", path: "/settings/privacy", ready: (page) => page.getByRole("switch", { name: "Protect my posts" }) },
  { title: "Notifications", path: "/settings/notifications", ready: (page) => page.getByRole("switch", { name: "Likes", exact: true }) },
  { title: "Subscriptions and tips", path: "/settings/billing", ready: (page) => page.getByRole("heading", { name: "Rhenko Plus" }) },
  { title: "Advertising", path: "/advertise", ready: (page) => page.getByRole("heading", { name: "Set up advertising" }) },
  { title: "Keyboard shortcuts", path: "/settings/shortcuts", ready: (page) => page.locator("dl kbd").first() },
]

// The nine kinds of notification, by the title of their switch. Each one has a line under it that says when it applies.
export const NOTIFICATION_TITLES = ["Likes", "Reposts", "Replies", "Quotes", "New followers", "Mentions", "Follow requests", "Poll results", "New posts"]

// The tenth switch on the page: mention notifications only from verified accounts.
export const MENTION_FILTER = "Mentions from verified accounts only"

export async function openSection(page, title) {
  const section = SECTIONS.find((item) => item.title === title)
  if (!section) throw new Error(`there is no settings section called ${title}`)
  await go(page, section.path, section.ready(page))
}

export function switchNamed(page, name) {
  return page.getByRole("switch", { name, exact: true })
}

export async function switchIsOn(page, name) {
  return (await switchNamed(page, name).getAttribute("aria-checked")) === "true"
}

// Flips one of the nine notification switches to the wanted state and waits for the page to say it was saved.
// Returns false when the switch was in that state already.
export async function setPref(page, title, wanted) {
  const toggle = switchNamed(page, title)
  await ready(toggle)
  if ((await toggle.getAttribute("aria-checked")) === String(wanted)) return false
  await acted(page, () => toggle.click())
  await toastText(page, new RegExp(`^${escapeRegExp(title)}: ${wanted ? "on" : "off"}`))
  await page.waitForFunction(
    ([label, on]) => document.querySelector(`[role="switch"][aria-label="${label}"]`)?.getAttribute("aria-checked") === String(on),
    [title, wanted]
  )
  return true
}

// The mention filter saves without a toast.
export async function setMentionFilter(page, wanted) {
  const toggle = switchNamed(page, MENTION_FILTER)
  await ready(toggle)
  if ((await toggle.getAttribute("aria-checked")) === String(wanted)) return false
  await acted(page, () => toggle.click())
  await page.waitForFunction(
    ([label, on]) => document.querySelector(`[role="switch"][aria-label="${label}"]`)?.getAttribute("aria-checked") === String(on),
    [MENTION_FILTER, wanted]
  )
  return true
}

// Opens the notification settings and sets the given kinds on or off. `kinds` maps a title to true or false.
export async function setPrefs(page, kinds) {
  await openSection(page, "Notifications")
  for (const [title, wanted] of Object.entries(kinds)) await setPref(page, title, wanted)
}
