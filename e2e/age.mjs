// Age checks end to end. A new account can read, but posting is refused until it confirms it is 18 or over. The check runs on
// Stripe's identity page, which the stand-in in e2e/lib/stripe-mock.mjs replaces. An account whose check comes back under 18
// stays refused. The area runs only when E2E_STRIPE=1 and the server was started with the Stripe test settings (e2e/stripe.env).
import { area, assert, check, guard, note } from "./lib/harness.mjs"
import { BASE, TIMEOUT, RUN_ID } from "./lib/env.mjs"
import { createUser } from "./lib/accounts.mjs"
import { query } from "./lib/db.mjs"
import { startStripeMock } from "./lib/stripe-mock.mjs"
import { homeComposer, openHome, typeIn, waitForPost, writePost } from "./lib/posts.mjs"
import { acted, go, toastText } from "./lib/ui.mjs"

const PORT = Number(process.env.STRIPE_MOCK_PORT || 4555)
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "whsec_e2e"
const ORIGIN = `http://127.0.0.1:${PORT}`
const NEEDS_CHECK = /Confirm your age to post/
const UNDER_18 = /18 and over/

export async function run() {
  area("age")
  if (!process.env.E2E_STRIPE) {
    note("Skipped. Start the server with e2e/stripe.env and set E2E_STRIPE=1 to run the age checks.")
    return
  }
  const mock = await startStripeMock({ port: PORT, webhookUrl: `${BASE}/api/stripe/webhook`, webhookSecret: WEBHOOK_SECRET, origin: ORIGIN })
  try {
    await guard("age checks", () => ageFlows(mock))
  } finally {
    await mock.close()
  }
}

// Starts the check from the settings page, then finishes it on the stand-in's page with the result asked for.
async function confirmAge(page, result) {
  const start = page.getByRole("button", { name: /^(Confirm my age|Continue my age check)$/ })
  await go(page, "/settings/age", start)
  await start.click()
  await page.waitForURL((url) => url.origin === ORIGIN && url.pathname.startsWith("/verify/"), { timeout: TIMEOUT })
  await page.getByRole("button", { name: result === "minor" ? "Verify as under 18" : "Verify as an adult", exact: true }).click()
  // Stripe sends the person back to the app's settings page, which then shows the outcome.
  await page.waitForURL((url) => url.href.startsWith(BASE) && url.pathname === "/settings/age", { timeout: TIMEOUT })
}

async function ageOf(handle) {
  const rows = await query("SELECT age_check FROM users WHERE handle = ?", handle)
  return rows[0]?.age_check
}

async function ageFlows(mock) {
  const fresh = await createUser({ tag: "fresh", adult: false })
  await check("a new account can read, but posting is refused until it confirms its age", async () => {
    await go(fresh.page, "/settings/age", fresh.page.getByRole("heading", { name: "Confirm you are 18 or over" }))
    await fresh.page.getByRole("button", { name: "Confirm my age", exact: true }).waitFor({ timeout: TIMEOUT })
    await openHome(fresh.page)
    const form = homeComposer(fresh.page)
    await typeIn(form, `Not yet ${RUN_ID}`)
    await acted(fresh.page, () => form.getByRole("button", { name: "Post", exact: true }).click())
    await toastText(fresh.page, NEEDS_CHECK)
    assert((await ageOf(fresh.handle)) === "none", "the account is not an adult before the check")
  })

  await check("confirming the age on Stripe's page makes the account an adult, and its posts then go out", async () => {
    await confirmAge(fresh.page, "adult")
    await fresh.page.getByText("Confirmed on", { exact: false }).waitFor({ timeout: TIMEOUT })
    assert((await ageOf(fresh.handle)) === "adult", "the result is stored as an adult")
    const text = `Adult now ${RUN_ID}`
    await writePost(fresh.page, text)
    await waitForPost(fresh.page, text)
    assert(mock.state.redacted.length > 0, "Stripe was asked to delete the data of the check once the result was in")
  })

  const young = await createUser({ tag: "young", adult: false })
  await check("an account whose check comes back under 18 can read, but cannot post", async () => {
    await confirmAge(young.page, "minor")
    await young.page.getByText("Rhenko is for people 18 and over", { exact: false }).waitFor({ timeout: TIMEOUT })
    assert((await ageOf(young.handle)) === "not_adult", "the result is stored as not an adult")
    await openHome(young.page)
    const form = homeComposer(young.page)
    await typeIn(form, `Too young ${RUN_ID}`)
    await acted(young.page, () => form.getByRole("button", { name: "Post", exact: true }).click())
    await toastText(young.page, UNDER_18)
  })
}
