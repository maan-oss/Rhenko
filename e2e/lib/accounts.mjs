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

// Fills the whole sign-up form. A field set to null is left empty.
export async function fillSignup(page, { name, handle, birthday, password, email }) {
  await ready(page.locator("input[name=handle]"))
  await page.locator("input[name=name]").fill(name ?? "")
  await page.locator("input[name=handle]").fill(handle ?? "")
  if (birthday) await pickBirthday(page, birthday)
  await page.locator("input[name=password]").fill(password ?? "")
  if (email) await page.locator("input[name=email]").fill(email)
}

// After a form posts: where did the person end up? Waits for the page to move on, or for an error to show.
async function settleAuth(page, { timeout = TIMEOUT } = {}) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    const path = new URL(page.url()).pathname
    if (path === "/") return { ok: true, step: "home" }
    if (path === "/login/verify") return { ok: true, step: "verify" }
    const alert = page.locator('form [role="alert"]').first()
    if ((await alert.count()) > 0) {
      const error = (await alert.innerText()).replace(/\s+/g, " ").trim()
      if (error) return { ok: false, error }
    }
    await sleep(150)
  }
  throw new Error(`the form neither moved on nor showed an error; the page is at ${page.url()}`)
}

// Submits the sign-up form once and reports what happened.
export async function trySignUp(page, fields) {
  await go(page, "/signup", page.locator("input[name=handle]"))
  await fillSignup(page, fields)
  await acted(page, () => page.getByRole("button", { name: "Create account", exact: true }).click())
  return settleAuth(page)
}

export async function signUp(page, fields) {
  const result = await trySignUp(page, fields)
  if (!result.ok) throw new Error(`sign-up of @${fields.handle} failed: ${result.error}`)
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
