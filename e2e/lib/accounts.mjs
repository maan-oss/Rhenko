// Making people: sign-up with the date picker, sign-in, sign-out, and a new account in a browser of its own.
import { PASSWORD, RUN_ID, TIMEOUT, randomHandle, sleep } from "./env.mjs"
import { newVisitor } from "./browser.mjs"
import { acted, go, ready } from "./ui.mjs"

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

// A birthday that passes the age rule by a wide margin.
export const GROWN_UP = { year: 1990, month: 4, day: 9 }

// The date `years` years and `days` days before today in the computer's own time zone, the same clock the date picker uses.
// A negative `days` is that many days after the anniversary: the person turns `years` in `-days` days.
export function dateBefore(years, days) {
  const date = new Date()
  date.setHours(12, 0, 0, 0)
  date.setFullYear(date.getFullYear() - years)
  date.setDate(date.getDate() - days)
  return { year: date.getFullYear(), month: date.getMonth(), day: date.getDate() }
}

export function readableDate({ year, month, day }) {
  return `${day} ${MONTHS[month]} ${year}`
}

function viewOf(text) {
  const [monthName, year] = text.trim().split(/\s+/)
  return { month: MONTHS.indexOf(monthName), year: Number(year) }
}

// Chooses a date in the sign-up form's own calendar: open it, pick the year, walk to the month, pick the day.
export async function pickBirthday(page, date) {
  await page.locator("#field-birthday").click()
  const dialog = page.getByRole("dialog", { name: "Choose a date" })
  await dialog.waitFor()
  const header = dialog.locator("button[aria-expanded]").first()
  await header.click()
  await dialog.getByRole("button", { name: String(date.year), exact: true }).click()
  for (let guard = 0; guard < 14; guard++) {
    const view = viewOf(await header.innerText())
    if (view.year === date.year && view.month === date.month) break
    await dialog.getByRole("button", { name: view.month > date.month ? "Previous month" : "Next month", exact: true }).click()
  }
  await dialog.getByRole("button", { name: readableDate(date), exact: true }).click()
  await dialog.waitFor({ state: "detached" })
}

// Presses the Continue button of the screen that is showing. The button must be on: the page keeps a screen with a
// refused value where it is.
// Continue on the first two screens only moves the form along in the page, so nothing is posted to the server.
async function continueScreen(page) {
  await page.locator("[data-step]:visible").getByRole("button", { name: "Continue", exact: true }).click()
}

// Fills the sign-up form, one screen at a time: name and handle, then birthday and optional email, then password and
// the agreement box. A field set to null is left empty, and the agreement box is ticked unless agree is false. The
// screens do not move on past a value the page refuses.
export async function fillSignup(page, { name, handle, birthday, password, email, agree = true }) {
  await ready(page.locator("input[name=handle]"))
  await page.locator("input[name=name]").fill(name ?? "")
  await page.locator("input[name=handle]").fill(handle ?? "")
  await continueScreen(page)
  await ready(page.locator("#field-birthday"))
  if (birthday) await pickBirthday(page, birthday)
  if (email) await page.locator("input[name=email]").fill(email)
  await continueScreen(page)
  await ready(page.locator("input[name=password]"))
  await page.locator("input[name=password]").fill(password ?? "")
  // The age and terms box is required. A test that leaves it empty says so with agree: false.
  if (agree) await page.locator("input[name=agree]").check()
}

// The human check finishes before the form is sent, as it does for a person waiting on the button. The button turns on
// only once the check has an answer and the screen is valid. A form sent before that gets a "confirm you're a person" reply.
export async function waitForCheck(page) {
  await page.waitForFunction(
    () => [...document.querySelectorAll("button")].some((button) => button.textContent.trim() === "Create account" && !button.disabled),
    null,
    { timeout: TIMEOUT }
  )
}

// Sends the sign-up form as it is, with every screen's button turned on so a refused value reaches the server.
async function sendSignup(page) {
  const create = page.locator("[data-step]:visible").getByRole("button", { name: "Create account", exact: true })
  await waitForCheck(page)
  await create.evaluate((element) => (element.disabled = false))
  await acted(page, () => create.click())
}

// After a form posts: where did the person end up? Waits for the page to move on, or for an error to show.
async function settleAuth(page, { timeout = TIMEOUT } = {}) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    const path = new URL(page.url()).pathname
    if (path === "/") return { ok: true, step: "home" }
    if (path === "/welcome") return { ok: true, step: "welcome" }
    if (path === "/login/verify") return { ok: true, step: "verify" }
    // Only what is on screen counts: a screen the form has moved away from can still hold an old message.
    const alert = page.locator('form [role="alert"]:visible').first()
    if ((await alert.count()) > 0) {
      const error = (await alert.innerText()).replace(/\s+/g, " ").trim()
      if (error) return { ok: false, error }
    }
    await sleep(150)
  }
  throw new Error(`the form neither moved on nor showed an error; the page is at ${page.url()}`)
}

// The date as the form's hidden birthday field holds it.
function isoDate({ year, month, day }) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

// Submits the sign-up form once and reports what the server said. The page will not move past a screen whose value it
// refuses, so the form is filled with valid values as a person would type them. The handle and birthday are then
// changed in the form's own fields before it is sent, which is how a value the page refuses reaches the server.
export async function trySignUp(page, fields) {
  await go(page, "/signup", page.locator("input[name=handle]"))
  const { handle, birthday, ...rest } = fields
  await fillSignup(page, { ...rest, handle: randomHandle("form"), birthday: GROWN_UP })
  // The human check finishes first. Its answer re-renders the form, which would put the form's own values back over the
  // ones written below, so the values are written only once the check is done.
  await waitForCheck(page)
  await page.evaluate(
    ({ handle, birthday }) => {
      for (const [name, value] of [
        ["handle", handle],
        ["birthday", birthday],
      ]) {
        const input = document.querySelector(`[name="${name}"]`)
        if (input) input.value = value
      }
    },
    { handle: handle ?? "", birthday: birthday ? isoDate(birthday) : "" }
  )
  await sendSignup(page)
  return settleAuth(page)
}

// A new account lands on the setup steps first. Most checks only need the home page, so they go straight there; a check
// about the setup steps passes { stay: true } and gets the page it was sent to.
export async function signUp(page, fields, { stay = false } = {}) {
  const result = await trySignUp(page, fields)
  if (!result.ok) throw new Error(`sign-up of @${fields.handle} failed: ${result.error}`)
  if (result.step === "welcome") {
    if (stay) return result
    await go(page, "/", page.locator("textarea[aria-label='Post text']"))
  }
  await page.locator("textarea[aria-label='Post text']").first().waitFor()
  return result
}

export async function trySignIn(page, { handle, password }) {
  await go(page, "/login", page.locator("input[name=handle]"))
  await page.locator("input[name=handle]").fill(handle)
  await page.locator("input[name=password]").fill(password)
  await acted(page, () => page.getByRole("button", { name: "Log in", exact: true }).click())
  return settleAuth(page)
}

// Signs in and lands on the home page. Throws with the page's own error message when it does not.
export async function signIn(page, creds) {
  const result = await trySignIn(page, creds)
  if (!result.ok) throw new Error(`sign-in of @${creds.handle} failed: ${result.error}`)
  if (result.step !== "home") throw new Error(`sign-in of @${creds.handle} asked for a second step (${page.url()})`)
  await page.locator("textarea[aria-label='Post text']").first().waitFor()
}

// Opens the left panel on a phone, where the navigation lives behind the avatar.
export async function openMenu(page) {
  await page.getByRole("button", { name: "Open menu" }).click()
  const menu = page.getByRole("dialog", { name: "Menu" })
  await menu.waitFor()
  return menu
}

// The Log out button: in the sidebar on a computer, in the left panel on a phone.
export async function signOut(user) {
  const { page } = user
  await go(page, "/", page.locator("textarea[aria-label='Post text']"))
  const scope = user.phone ? await openMenu(page) : page
  await scope.getByRole("button", { name: "Log out", exact: true }).click()
  await page.waitForURL((url) => url.pathname === "/login", { timeout: TIMEOUT })
}

// A new account in a browser of its own. `tag` is a short role name that ends up in the handle and display name.
export async function createUser({ tag, phone = false, mic = false, birthday = GROWN_UP, password = PASSWORD, name } = {}) {
  const handle = randomHandle(tag)
  const display = name ?? `${tag[0].toUpperCase()}${tag.slice(1)} ${RUN_ID}`
  const visitor = await newVisitor({ phone, mic, label: tag })
  const user = { ...visitor, tag, handle, name: display, password, birthday }
  await signUp(user.page, { name: display, handle, birthday, password })
  return user
}

// Another way into an existing account: a new browser, signed in with the same handle and password.
export async function signInElsewhere(user, { phone = user.phone, mic = false, label = `${user.tag}-b` } = {}) {
  const visitor = await newVisitor({ phone, mic, label })
  await signIn(visitor.page, { handle: user.handle, password: user.password })
  return { ...user, ...visitor }
}
