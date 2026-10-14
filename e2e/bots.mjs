// Bots and fake accounts, as a person meets them in the browser. A program that fills in the hidden field is refused and
// makes no account. A new account that the scorer marks is asked for the human check before it can follow someone, and
// once it has passed the check it is not asked again straight away.
import { area, assert, guard } from "./lib/harness.mjs"
import { BASE, PASSWORD, TIMEOUT, randomHandle } from "./lib/env.mjs"
import { GROWN_UP, createUser, fillSignup, signUp, waitForCheck } from "./lib/accounts.mjs"
import { newVisitor } from "./lib/browser.mjs"
import { openProfile } from "./lib/posts.mjs"
import { query } from "./lib/db.mjs"

const UNSENT = "Something went wrong. Refresh the page and try again."
const CHECK_TITLE = "One quick check"

export async function run() {
  area("bots")
  await guard("a sign-up with the hidden field filled in is refused and makes no account", honeypotRefused)
  await guard("a new account the scorer marks is asked for a human check before it follows, and not again straight away", followChecked)
}

async function honeypotRefused() {
  const { page } = await newVisitor({ label: "bot" })
  const handle = randomHandle("spam")
  await page.goto(`${BASE}/signup`)
  await page.locator("input[name=handle]").waitFor({ timeout: TIMEOUT })
  await fillSignup(page, { name: "Spam bot", handle, birthday: GROWN_UP, password: PASSWORD })
  // A program fills in every field it finds, including the one a person never sees.
  await page.evaluate(() => {
    const field = document.querySelector('input[name="website"]')
    if (field) field.value = "https://example.test"
  })
  await waitForCheck(page)
  await page.locator("[data-step]:visible").getByRole("button", { name: "Create account", exact: true }).click()
  await page.locator('form [role="alert"]:visible', { hasText: UNSENT }).waitFor({ timeout: TIMEOUT })
  assert.equal(new URL(page.url()).pathname, "/signup", "the refused sign-up should stay on the sign-up page")
  const rows = await query("SELECT id FROM users WHERE handle = ?", handle)
  assert.equal(rows.length, 0, "a sign-up with the hidden field filled in made an account")
}

async function followChecked() {
  const first = await createUser({ tag: "target" })
  const second = await createUser({ tag: "second" })
  // A handle that ends in six digits, made with no confirmed email and no profile, is the kind of account the scorer checks.
  const { page } = await newVisitor({ label: "checked" })
  const handle = `checked${String(Date.now()).slice(-6)}`
  await signUp(page, { name: "Checked person", handle, birthday: GROWN_UP, password: PASSWORD })

  // A profile can show the same person's follow button twice, in the header and in a suggestion list. The header comes first.
  await openProfile(page, first.handle)
  await page.getByRole("main").getByRole("button", { name: `Follow @${first.handle}`, exact: true }).first().click()
  await page.getByRole("dialog", { name: CHECK_TITLE }).waitFor({ timeout: TIMEOUT })
  await page.getByRole("main").getByRole("button", { name: `Unfollow @${first.handle}`, exact: true }).first().waitFor({ timeout: TIMEOUT })

  await openProfile(page, second.handle)
  await page.getByRole("main").getByRole("button", { name: `Follow @${second.handle}`, exact: true }).first().click()
  await page.getByRole("main").getByRole("button", { name: `Unfollow @${second.handle}`, exact: true }).first().waitFor({ timeout: TIMEOUT })
  assert.equal(await page.getByRole("dialog", { name: CHECK_TITLE }).count(), 0, "the check was asked for again straight away")
}
