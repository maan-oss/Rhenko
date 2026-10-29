// Settings: the list of sections, the theme, keyboard shortcuts, the nine notification switches and what they really turn
// off, the status line, muted words on the privacy page, and password and signed-in devices on the security page.
// The pages run on a computer and on a phone, so every page is also measured for sideways overflow on both.
import { area, assert, check, guard, need } from "./lib/harness.mjs"
import { PASSWORD, RUN_ID, randomWord, sleep } from "./lib/env.mjs"
import { closeVisitor } from "./lib/browser.mjs"
import { createUser, signInElsewhere, trySignIn } from "./lib/accounts.mjs"
import { bannersSeen, idleOnSettings, recordBanners, sawBanner } from "./lib/live.mjs"
import { addMutedWord, follow, followButton, noticeRow, openNotifications, openPrivacy, removeMutedWord, unfollowButton } from "./lib/people.mjs"
import { likeButton, openProfile, repostTrigger, waitForPost, writePost } from "./lib/posts.mjs"
import {
  MENTION_FILTER,
  NOTIFICATION_TITLES,
  SECTIONS,
  openSection,
  setMentionFilter,
  setPref,
  setPrefs,
  switchIsOn,
  switchNamed,
} from "./lib/settings.mjs"
import { acted, alertText, fillField, formWithButton, go, pageBrightness, toastText } from "./lib/ui.mjs"
import { allowNoise } from "./lib/watch.mjs"

function uniq(label) {
  return `${label} ${RUN_ID}${randomWord(4)}`
}

export async function run() {
  area("settings")
  for (const phone of [false, true]) await guard(`settings pages on a ${phone ? "phone" : "computer"}`, () => settingsPages({ phone }))
  await guard("what the notification switches really switch off", switchEffects)
  await guard("password and signed-in devices", security)
}

// ---------------------------------------------------------------------------------------------------------------------
// The pages themselves
// ---------------------------------------------------------------------------------------------------------------------

const DARK_ON = () => document.documentElement.classList.contains("dark")
const DARK_OFF = () => !document.documentElement.classList.contains("dark")

// The theme card that is selected right now.
function chosenTheme(page, name) {
  return page.locator('[role="radio"][aria-checked="true"]').filter({ hasText: name })
}

// The panel that sweeps over the screen while the theme changes is gone again.
async function sweepGone(page) {
  await page.waitForFunction(() => !document.querySelector("body > div.pointer-events-none.fixed.inset-0"), null, { timeout: 8000 })
}

async function chooseTheme(page, name) {
  await page.getByRole("radio", { name, exact: true }).click()
  await page.waitForFunction(name === "Dark" ? DARK_ON : DARK_OFF, null, { timeout: 8000 })
  await chosenTheme(page, name).waitFor()
  await sweepGone(page)
}

// Presses keys until the page is at the wanted path. The first press can come before the page listens for keys.
async function pressUntil(page, keys, path) {
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
    for (const key of keys) await page.keyboard.press(key)
    try {
      await page.waitForURL((url) => url.pathname === path, { timeout: 2500 })
      return
    } catch {
      // Not there yet. Try again from the top of the sequence.
    }
  }
  throw new Error(`pressing ${keys.join(" then ")} did not open ${path}; the page is at ${page.url()}`)
}

// The status line has to show somewhere other than the form that sets it.
async function showsStatus(scope, text, where) {
  try {
    await scope.getByText(text).first().waitFor({ timeout: 6000 })
  } catch {
    throw new Error(`the status "${text}" is saved but is not shown ${where}, although the Status form says it shows with the name on the profile and in the sidebar`)
  }
}

// Waits for a field to hold a value. A form that was just saved shows the saved value a moment after the server answered.
async function holds(page, selector, expected, message) {
  try {
    await page.waitForFunction(([css, value]) => document.querySelector(css)?.value === value, [selector, expected], { timeout: 8000 })
  } catch {
    const now = await page.locator(selector).inputValue().catch(() => "(no such field)")
    throw new Error(`${message}: the field holds "${now}", expected "${expected}"`)
  }
}

async function settingsPages({ phone }) {
  const where = phone ? "phone" : "desktop"
  const user = await createUser({ tag: phone ? "stp" : "std", phone })
  const { page } = user

  await check(`${where}: the Settings page lists every section, each one opens, and Back returns`, async () => {
    await go(page, "/settings", page.getByRole("navigation", { name: "Settings sections" }))
    const nav = page.getByRole("navigation", { name: "Settings sections" })
    const titles = (await nav.getByRole("link").allInnerTexts()).map((text) => text.trim())
    // Notices and Legal are their own pages, reached from this list (last, under Policies), so they are listed but not
    // opened as sections.
    const expected = [...SECTIONS.map((section) => section.title), "Notices and appeals", "Legal"]
    assert.deepEqual(titles, expected, "the Settings page lists different sections than expected")
    await page.locator("main").getByRole("button", { name: "Log out", exact: true }).waitFor()
    for (const section of SECTIONS) {
      await nav.getByRole("link", { name: section.title, exact: true }).click()
      await page.waitForURL((url) => url.pathname === section.path)
      await section.ready(page).first().waitFor()
      await page.getByRole("heading", { level: 1, name: section.title, exact: true }).waitFor()
      await page.getByRole("link", { name: "Back", exact: true }).click()
      await page.waitForURL((url) => url.pathname === "/settings")
      await nav.waitFor()
    }
  })

  await check(`${where}: Appearance: Dark and Light change the whole page, and the choice is remembered`, async () => {
    await openSection(page, "Appearance")
    await chosenTheme(page, "Light").waitFor()
    assert.equal(await page.evaluate(DARK_ON), false, "the page starts dark, although the theme is Light")
    assert.ok((await pageBrightness(page)) > 180, "the light theme has a dark background")

    await chooseTheme(page, "Dark")
    assert.ok((await pageBrightness(page)) < 90, "the dark theme has a light background")
    await page.reload({ waitUntil: "domcontentloaded" })
    await chosenTheme(page, "Dark").waitFor()
    assert.equal(await page.evaluate(DARK_ON), true, "the dark theme is gone after a reload")

    await go(page, "/explore", page.locator("main"))
    assert.equal(await page.evaluate(DARK_ON), true, "the dark theme does not follow to another page")
    assert.ok((await pageBrightness(page)) < 90, "another page is light after Dark was chosen")

    await openSection(page, "Appearance")
    await chooseTheme(page, "Light")
    assert.ok((await pageBrightness(page)) > 180, "the light theme has a dark background after switching back")
    await page.reload({ waitUntil: "domcontentloaded" })
    await chosenTheme(page, "Light").waitFor()
    assert.equal(await page.evaluate(DARK_ON), false, "the light theme is gone after a reload")
  })

  await check(`${where}: Appearance: the arrow keys move between the two themes`, async () => {
    await openSection(page, "Appearance")
    const light = chosenTheme(page, "Light")
    await light.waitFor()
    await light.focus()
    await page.keyboard.press("ArrowRight")
    await page.waitForFunction(DARK_ON, null, { timeout: 8000 })
    await chosenTheme(page, "Dark").waitFor()
    await sweepGone(page)
    await page.keyboard.press("ArrowLeft")
    await page.waitForFunction(DARK_OFF, null, { timeout: 8000 })
    await chosenTheme(page, "Light").waitFor()
    await sweepGone(page)
  })

  await check(`${where}: Keyboard shortcuts lists the keys the app listens for`, async () => {
    await openSection(page, "Keyboard shortcuts")
    const keys = (await page.locator("dl kbd").allInnerTexts()).map((text) => text.trim())
    for (const wanted of ["n", "/", "j / k", "g then h", "g then e", "g then n", "g then m", "g then b", "g then p", "?"]) {
      assert.ok(keys.includes(wanted), `the key "${wanted}" is not listed; the page lists: ${keys.join(" | ")}`)
    }
    const labels = (await page.locator("dl dd").allInnerTexts()).map((text) => text.trim())
    assert.equal(labels.length, keys.length, "a key is listed without its meaning, or the other way round")
    assert.ok(
      labels.every((text) => text.length > 2),
      "a key has an empty meaning"
    )
  })

  if (!phone) {
    await check("desktop: the shortcuts move between pages, n focuses the composer, typing ignores them, and ? lists the keys", async () => {
      await openSection(page, "Keyboard shortcuts")
      await sleep(400)
      const trips = [
        [["g", "e"], "/explore"],
        [["g", "n"], "/notifications"],
        [["g", "m"], "/messages"],
        [["g", "b"], "/bookmarks"],
        [["g", "p"], `/${user.handle}`],
        [["g", "h"], "/"],
        [["/"], "/explore"],
      ]
      for (const [keys, path] of trips) await pressUntil(page, keys, path)

      await pressUntil(page, ["g", "h"], "/")
      await page.locator("form#compose textarea").waitFor()
      await sleep(300)
      await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
      await page.keyboard.press("n")
      await page.waitForFunction(() => document.activeElement?.matches("#compose textarea") === true, null, { timeout: 4000 })
      await page.keyboard.type("ge")
      assert.equal(new URL(page.url()).pathname, "/", "typing g then e in the composer moved to another page")
      assert.equal(await page.locator("form#compose textarea").inputValue(), "ge")
      await page.locator("form#compose textarea").fill("")

      await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
      await page.keyboard.press("?")
      const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" })
      await dialog.waitFor()
      assert.ok((await dialog.locator("kbd").count()) >= 10, "the list of keys in the dialog is short")
      await page.keyboard.press("Escape")
      await dialog.waitFor({ state: "detached" })
    })
  }

  await check(`${where}: Notifications: nine switches, all on at first, each saves with a message and holds after a reload`, async () => {
    await openSection(page, "Notifications")
    // The page also has the push and daily-digest switches, so each named switch is checked rather than counting them all.
    for (const name of [...NOTIFICATION_TITLES, MENTION_FILTER]) {
      assert.equal(await switchNamed(page, name).count(), 1, `${name} is not on the notifications page`)
    }
    for (const title of NOTIFICATION_TITLES) {
      assert.equal(await switchIsOn(page, title), true, `${title} starts off`)
      const hint = await switchNamed(page, title).getAttribute("aria-describedby")
      assert.ok(hint, `${title} has no line saying when it applies`)
      const text = (await page.locator(`[id="${hint}"]`).innerText()).trim()
      assert.ok(text.length > 15, `${title} has an empty or very short line saying when it applies: "${text}"`)
    }
    for (const title of NOTIFICATION_TITLES) await setPref(page, title, false)
    await openSection(page, "Notifications")
    for (const title of NOTIFICATION_TITLES) assert.equal(await switchIsOn(page, title), false, `${title} came back on after a reload`)
    for (const title of NOTIFICATION_TITLES) await setPref(page, title, true)
    await openSection(page, "Notifications")
    for (const title of NOTIFICATION_TITLES) assert.equal(await switchIsOn(page, title), true, `${title} came back off after a reload`)
  })

  await check(`${where}: Notifications: the mention filter is off at first, saves, and holds after a reload`, async () => {
    await openSection(page, "Notifications")
    assert.equal(await switchIsOn(page, MENTION_FILTER), false, "mentions are limited to verified accounts from the start")
    await setMentionFilter(page, true)
    await openSection(page, "Notifications")
    assert.equal(await switchIsOn(page, MENTION_FILTER), true, "the mention filter came back off after a reload")
    await setMentionFilter(page, false)
    await openSection(page, "Notifications")
    assert.equal(await switchIsOn(page, MENTION_FILTER), false, "the mention filter came back on after a reload")
  })

  // ------------------------------------------------------------------------------------------------ status
  const status = `Status ${RUN_ID}${randomWord(3)}`
  const field = page.locator("#account-status")
  const saveStatus = page.getByRole("button", { name: "Save", exact: true })

  await check(`${where}: Status: Save waits for a change, the counter counts, and 41 characters are refused`, async () => {
    await openSection(page, "Account")
    assert.equal(await saveStatus.isDisabled(), true, "Save is enabled although the status did not change")
    assert.equal(await page.getByRole("button", { name: "Clear status", exact: true }).count(), 0, "Clear status is offered with no status")
    await page.getByText("0/40", { exact: true }).waitFor()
    await field.fill(status)
    await page.getByText(`${status.length}/40`, { exact: true }).waitFor()
    assert.equal(await saveStatus.isDisabled(), false, "Save stays disabled after typing a status")
    await field.fill("x".repeat(41))
    await page.getByText("That's 1 over the 40-character limit.").waitFor()
    await page.getByText("41/40", { exact: true }).waitFor()
    assert.equal(await field.getAttribute("aria-invalid"), "true", "the field is not marked invalid at 41 characters")
    assert.equal(await saveStatus.isDisabled(), true, "Save is enabled with a status over the limit")
    await field.fill("x".repeat(40))
    assert.equal(await saveStatus.isDisabled(), false, "Save is disabled with exactly 40 characters")
  })

  await check(`${where}: Status: Save keeps the line after a reload, and spaces are squeezed`, async () => {
    await openSection(page, "Account")
    await field.fill(status)
    await acted(page, () => saveStatus.click())
    await toastText(page, /^Status saved\./)
    await page.getByRole("button", { name: "Clear status", exact: true }).waitFor()
    assert.equal(await saveStatus.isDisabled(), true, "Save is enabled right after saving")
    await openSection(page, "Account")
    await holds(page, "#account-status", status, "the saved status is not in the field after a reload")

    await field.fill("   Out    for   a   walk   ")
    await page.getByText("14/40", { exact: true }).waitFor()
    await acted(page, () => saveStatus.click())
    await toastText(page, /^Status saved\./)
    await holds(page, "#account-status", "Out for a walk", "extra spaces are kept in the saved status")
    await field.fill(status)
    await acted(page, () => saveStatus.click())
    await holds(page, "#account-status", status, "the status was not saved")
    await page.getByText(`${status.length}/40`, { exact: true }).waitFor()
    await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent === "Save" && b.disabled))
  })

  await check(`${where}: Status: the line shows on the profile${phone ? "" : ", to other people, and in the sidebar"}`, async () => {
    await openProfile(page, user.handle)
    await showsStatus(page.locator("main"), status, "on the profile")
    if (phone) return
    await go(page, "/explore", page.locator("main"))
    await showsStatus(page, status, "in the sidebar")
    const watcher = await createUser({ tag: "stw" })
    await openProfile(watcher.page, user.handle)
    await showsStatus(watcher.page.locator("main"), status, "on the profile to another person")
  })

  await check(`${where}: Status: Clear status empties it and takes it off the profile`, async () => {
    await openSection(page, "Account")
    await acted(page, () => page.getByRole("button", { name: "Clear status", exact: true }).click())
    await toastText(page, /^Status cleared\./)
    await holds(page, "#account-status", "", "the field still holds the status after Clear status")
    await page.getByRole("button", { name: "Clear status", exact: true }).waitFor({ state: "detached" })
    await openProfile(page, user.handle)
    assert.equal(await page.getByText(status, { exact: true }).count(), 0, "the cleared status is still on the profile")
  })

  // ------------------------------------------------------------------------------------------------ muted words
  await check(`${where}: Privacy and safety: a muted word is kept in lower case without its #, listed once, and removed with Remove`, async () => {
    const tag = `Mute${randomWord(4)}`
    const stored = tag.toLowerCase()
    await addMutedWord(page, `#${tag}`)
    await openPrivacy(page)
    await page.locator("main").getByText(stored, { exact: true }).waitFor()
    await addMutedWord(page, tag)
    await openPrivacy(page)
    assert.equal(await page.locator("main").getByText(stored, { exact: true }).count(), 1, "the same word is listed twice")
    await removeMutedWord(page, stored)
    await openPrivacy(page)
    assert.equal(await page.locator("main").getByText(stored, { exact: true }).count(), 0, "the muted word is still listed after Remove")
  })

  await check(`${where}: the Log out button on the Settings page ends the session`, async () => {
    // Logging out moves the page to the sign-in page. Measured on Next 16.4.0: the router then prefetches the sign-in page
    // while it still holds the signed-in layout's route state. The sign-in page sits outside that layout, so that prefetch
    // answers 404, and Next caches the answer. The navigation itself is a separate request and loads the sign-in page
    // correctly. This allows that one console message during this check only.
    const endAllow = allowNoise({
      id: "sign-in-rsc-during-log-out",
      kind: "console",
      text: /Failed to load resource: the server responded with a status of 404/,
      url: /\/login\?/,
      reason:
        "After log-out, the router prefetches the sign-in page with the signed-in layout's route state; that prefetch answers 404. The sign-in page itself loads correctly.",
    })
    try {
      await go(page, "/settings", page.getByRole("navigation", { name: "Settings sections" }))
      await page.locator("main").getByRole("button", { name: "Log out", exact: true }).click()
      // It asks first, the same as the sidebar button, and the dialog's own Log out button ends the session.
      const asking = page.getByRole("dialog", { name: "Log out of Rhenko?" })
      await asking.waitFor()
      await asking.getByRole("button", { name: "Log out", exact: true }).click()
      await page.waitForURL((url) => url.pathname === "/login")
      await page.goto("/settings")
      await page.waitForURL((url) => url.pathname === "/login")
    } finally {
      endAllow()
    }
  })
}

// ---------------------------------------------------------------------------------------------------------------------
// What the notification switches really switch off
// ---------------------------------------------------------------------------------------------------------------------

// The row of the notifications page with this wording and, in its preview, this post.
function rowWith(page, wording, postText) {
  return page.locator("main").getByRole("link").filter({ hasText: wording }).filter({ hasText: postText })
}

const SWITCHED = /liked your post|reposted your post|followed you|mentioned you/

async function switchEffects() {
  const author = await createUser({ tag: "nsa" })
  const reader = await createUser({ tag: "nsr" })
  const [p1, p2, p3] = [uniq("Switch post one"), uniq("Switch post two"), uniq("Switch post three")]
  for (const text of [p1, p2, p3]) await writePost(author.page, text)

  const like = async (text) => {
    await openProfile(reader.page, author.handle)
    const target = await waitForPost(reader.page, text)
    await acted(reader.page, () => likeButton(target).click())
    await target.getByRole("button", { name: /^Unlike, 1 like$/ }).waitFor()
  }
  const repost = async (text) => {
    await openProfile(reader.page, author.handle)
    const target = await waitForPost(reader.page, text)
    await repostTrigger(target).click()
    await acted(reader.page, () => reader.page.getByRole("menuitem", { name: "Repost", exact: true }).click())
    await target.getByRole("button", { name: /^Repost, 1 repost$/ }).waitFor()
  }
  const mention = async (label) => {
    const text = uniq(`${label} @${author.handle}`)
    await writePost(reader.page, text)
    return text
  }
  const listen = async () => {
    await idleOnSettings(author.page)
    await recordBanners(author.page)
  }

  await check("switched off: likes, reposts, new followers and mentions send no banner and leave nothing on the notifications page", async () => {
    await setPrefs(author.page, { Likes: false, Reposts: false, "New followers": false, Mentions: false })
    await listen()
    await like(p1)
    await repost(p1)
    await follow(reader.page, author.handle)
    await mention("Ping one")
    await sleep(2500)
    const unwanted = (await bannersSeen(author.page)).filter((text) => SWITCHED.test(text))
    assert.deepEqual(unwanted, [], `banners came for notifications that were switched off: ${unwanted.join(" | ")}`)
    await openNotifications(author.page)
    await author.page.getByText("Nothing here yet", { exact: true }).waitFor()
    await openNotifications(author.page, "mentions")
    await author.page.getByText("No mentions yet", { exact: true }).waitFor()
  })

  await check("switched on one at a time: Likes arrive, Reposts still do not", async () => {
    await setPrefs(author.page, { Likes: true })
    await listen()
    await like(p2)
    await repost(p2)
    const liked = await sawBanner(author.page, "liked your post")
    assert.ok(liked, "switching Likes back on did not bring the like banner back")
    assert.ok(liked.includes(reader.name), `the like banner does not name who liked the post: ${liked}`)
    await sleep(2000)
    const reposts = (await bannersSeen(author.page)).filter((text) => text.includes("reposted your post"))
    assert.deepEqual(reposts, [], "a repost banner came although Reposts is still off")
    await openNotifications(author.page)
    await rowWith(author.page, "liked your post", p2).first().waitFor()
    const others = await author.page.locator("main").getByRole("link").filter({ hasText: /reposted your post|followed you|mentioned you/ }).count()
    assert.equal(others, 0, "the notifications page lists a kind that is still switched off")
  })

  let secondMention = null
  await check("switched on again: reposts, new followers and mentions arrive as banners and as rows", async () => {
    await setPrefs(author.page, { Reposts: true, "New followers": true, Mentions: true })
    await listen()
    await repost(p3)
    await openProfile(reader.page, author.handle)
    await acted(reader.page, () => unfollowButton(reader.page, author.handle).click())
    await toastText(reader.page, /^You unfollowed @/)
    await followButton(reader.page, author.handle).waitFor()
    await follow(reader.page, author.handle)
    secondMention = await mention("Ping two")
    for (const [wording, label] of [
      ["reposted your post", "repost"],
      ["followed you", "new follower"],
      ["mentioned you", "mention"],
    ]) {
      assert.ok(await sawBanner(author.page, wording), `no ${label} banner arrived after that switch was turned back on`)
    }
    await openNotifications(author.page)
    await rowWith(author.page, "reposted your post", p3).first().waitFor()
    await noticeRow(author.page, { name: reader.name, text: "followed you" }).waitFor()
    await openNotifications(author.page, "mentions")
    await rowWith(author.page, "mentioned you", secondMention).first().waitFor()
  })

  await check("Mentions from verified accounts only: a mention from an account that is not verified sends nothing", async () => {
    need(secondMention, "the mention that arrived while Mentions was on")
    await openSection(author.page, "Notifications")
    await setMentionFilter(author.page, true)
    await listen()
    const third = await mention("Ping three")
    await sleep(3000)
    const banners = (await bannersSeen(author.page)).filter((text) => text.includes("mentioned you"))
    assert.deepEqual(banners, [], "a mention banner came from an account that is not verified")
    await openNotifications(author.page, "mentions")
    await rowWith(author.page, "mentioned you", secondMention).first().waitFor()
    assert.equal(await rowWith(author.page, "mentioned you", third).count(), 0, "the mention from an account that is not verified is listed")
  })

  await check("Mentions from verified accounts only: switched off again, mentions arrive again", async () => {
    await openSection(author.page, "Notifications")
    await setMentionFilter(author.page, false)
    await listen()
    const fourth = await mention("Ping four")
    assert.ok(await sawBanner(author.page, "mentioned you"), "no mention banner arrived after the filter was switched off")
    await openNotifications(author.page, "mentions")
    await rowWith(author.page, "mentioned you", fourth).first().waitFor()
  })
}

// ---------------------------------------------------------------------------------------------------------------------
// Password and signed-in devices
// ---------------------------------------------------------------------------------------------------------------------

async function security() {
  const user = await createUser({ tag: "sec" })
  const fresh = `${PASSWORD}-new`
  const { page } = user
  const openSecurity = () => go(page, "/settings/security", page.getByRole("button", { name: "Change password", exact: true }))

  await check("security: this device and a second one are listed, and only the other one has Sign out", async () => {
    const second = await signInElsewhere(user, { label: "sec-second" })
    await openSecurity()
    await page.getByText("2 devices are signed in to your account.").waitFor()
    assert.equal(await page.getByText("This device", { exact: true }).count(), 1, "the list does not mark exactly one device as this one")
    assert.equal(await page.getByRole("button", { name: "Sign out", exact: true }).count(), 1, "there is not exactly one Sign out button for the one other device")
    await page.getByRole("button", { name: "Sign out other devices", exact: true }).waitFor()

    await acted(page, () => page.getByRole("button", { name: "Sign out", exact: true }).click())
    await toastText(page, /^That device is signed out\./)
    await page.getByText("1 device is signed in to your account.").waitFor()
    await second.page.goto("/settings")
    await second.page.waitForURL((url) => url.pathname === "/login")
    await closeVisitor(second)
    assert.equal(await page.getByRole("button", { name: "Sign out other devices", exact: true }).count(), 0, "Sign out other devices is offered with no other device")
  })

  await check("security: Sign out other devices ends every other session and keeps this one", async () => {
    const [b, c] = [await signInElsewhere(user, { label: "sec-b" }), await signInElsewhere(user, { label: "sec-c" })]
    await openSecurity()
    await page.getByText("3 devices are signed in to your account.").waitFor()
    await acted(page, () => page.getByRole("button", { name: "Sign out other devices", exact: true }).click())
    await toastText(page, /^Signed out of other devices\./)
    await page.getByText("1 device is signed in to your account.").waitFor()
    for (const other of [b, c]) {
      await other.page.goto("/settings")
      await other.page.waitForURL((url) => url.pathname === "/login")
      await closeVisitor(other)
    }
    await page.reload()
    await page.getByRole("button", { name: "Change password", exact: true }).waitFor()
  })

  await check("security: Change password refuses a wrong current password and a new password equal to the old one", async () => {
    await openSecurity()
    const form = formWithButton(page, "Change password")
    await fillField(form, "current", `${PASSWORD}-wrong`)
    await fillField(form, "next", fresh)
    await acted(page, () => form.getByRole("button", { name: "Change password", exact: true }).click())
    assert.match(await alertText(form), /isn't your current password/)
    await fillField(form, "current", PASSWORD)
    await fillField(form, "next", PASSWORD)
    await acted(page, () => form.getByRole("button", { name: "Change password", exact: true }).click())
    assert.match(await alertText(form, { match: /different/ }), /different from the current one/)
  })

  await check("security: a new password signs the other devices out, and from then on only the new one signs in", async () => {
    const other = await signInElsewhere(user, { label: "sec-before-change" })
    await openSecurity()
    const form = formWithButton(page, "Change password")
    await fillField(form, "current", PASSWORD)
    await fillField(form, "next", fresh)
    await acted(page, () => form.getByRole("button", { name: "Change password", exact: true }).click())
    await toastText(page, /^Password changed\. Other devices were signed out\./)
    await other.page.goto("/settings")
    await other.page.waitForURL((url) => url.pathname === "/login")
    await page.reload()
    await page.getByRole("button", { name: "Change password", exact: true }).waitFor()

    const old = await trySignIn(other.page, { handle: user.handle, password: PASSWORD })
    assert.equal(old.ok, false, "the old password still signs in after it was changed")
    const renewed = await trySignIn(other.page, { handle: user.handle, password: fresh })
    assert.equal(renewed.ok, true, `the new password does not sign in: ${renewed.error}`)
    assert.equal(renewed.step, "home")
    await closeVisitor(other)
  })

  await check("phone: the Security page fits the screen with two devices listed", async () => {
    const phone = await signInElsewhere({ ...user, password: fresh }, { phone: true, label: "sec-phone" })
    await go(phone.page, "/settings/security", phone.page.getByRole("button", { name: "Change password", exact: true }))
    await phone.page.getByText(/^\d+ devices are signed in to your account\.$/).waitFor()
    await closeVisitor(phone)
  })
}
