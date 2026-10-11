// Following, muting, blocking and the privacy page. Buttons are looked for inside <main>: the right-hand column offers
// Follow buttons for suggested people too, and the same handle can be in both places.
import { escapeRegExp } from "./env.mjs"
import { acted, go, ready, toastText } from "./ui.mjs"
import { openProfile } from "./posts.mjs"

function named(prefix, handle) {
  return new RegExp(`^${prefix} @?${escapeRegExp(handle)}$`, "i")
}

export function followButton(page, handle) {
  return page.locator("main").getByRole("button", { name: named("Follow", handle) })
}

export function unfollowButton(page, handle) {
  return page.locator("main").getByRole("button", { name: named("Unfollow", handle) })
}

// The button a pending follow request turns the Follow button into.
export function withdrawButton(page, handle) {
  return page.locator("main").getByRole("button", { name: new RegExp(`^Withdraw follow request to @?${escapeRegExp(handle)}$`, "i") })
}

// Follows a public account from its profile and waits for the answer.
export async function follow(page, handle) {
  await openProfile(page, handle)
  await acted(page, () => followButton(page, handle).click())
  await toastText(page, /^You follow @/)
  await unfollowButton(page, handle).waitFor()
}

// The menu behind the three dots at the top of someone else's profile.
export async function profileMenu(page, itemName) {
  await page.locator("main").getByRole("button", { name: "More options" }).first().click()
  await page.getByRole("menuitem", { name: itemName }).click()
}

export async function mute(page, handle) {
  await openProfile(page, handle)
  await acted(page, () => profileMenu(page, `Mute @${handle}`))
  await toastText(page, /^Muted @/)
}

export async function unmute(page, handle) {
  await openProfile(page, handle)
  await acted(page, () => profileMenu(page, `Unmute @${handle}`))
  await toastText(page, /^Unmuted @/)
}

// Blocks from the profile: the menu, then the question, then the answer.
export async function block(page, handle) {
  await openProfile(page, handle)
  await profileMenu(page, `Block @${handle}`)
  const dialog = page.getByRole("dialog", { name: `Block @${handle}?` })
  await dialog.waitFor()
  await acted(page, () => dialog.getByRole("button", { name: "Block", exact: true }).click())
  await toastText(page, /^Blocked @/)
}

// The Privacy and safety settings.
export async function openPrivacy(page) {
  await go(page, "/settings/privacy", page.getByRole("switch", { name: "Protect my posts" }))
}

export async function setProtected(page, wanted) {
  await openPrivacy(page)
  const toggle = page.getByRole("switch", { name: "Protect my posts" })
  const now = (await toggle.getAttribute("aria-checked")) === "true"
  if (now === wanted) return null
  await acted(page, () => toggle.click())
  const message = await toastText(page, wanted ? /^Your account is protected/ : /^Your account is public/)
  await page.waitForFunction((on) => document.querySelector('main [role="switch"]')?.getAttribute("aria-checked") === String(on), wanted)
  return message
}

// Adds a muted word on the privacy page. The form clears itself after an action, so the word is typed fresh each time.
export async function addMutedWord(page, word) {
  await openPrivacy(page)
  const field = page.locator("input[name=word]")
  await ready(field)
  await field.fill(word)
  await acted(page, () => page.getByRole("button", { name: "Mute", exact: true }).click())
  await toastText(page, /^Muted “/)
}

export async function removeMutedWord(page, word) {
  await openPrivacy(page)
  await acted(page, () => page.getByRole("button", { name: `Unmute ${word}`, exact: true }).click())
  await toastText(page, /^Unmuted “/)
}

// A row of the notifications page: the link that holds this person's name and this wording.
export function noticeRow(page, { name, text }) {
  let row = page.locator("main").getByRole("link").filter({ hasText: text })
  if (name) row = row.filter({ hasText: name })
  return row.first()
}

export async function openNotifications(page, tab) {
  await go(page, tab ? `/notifications?tab=${tab}` : "/notifications", page.getByRole("navigation", { name: "Sections" }))
}

// The follow requests box on the notifications page.
export function requestsBox(page) {
  return page.getByRole("region", { name: "Follow requests" })
}
