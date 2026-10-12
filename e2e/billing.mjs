// Payments end to end: Plus through Stripe's checkout, withdrawal with a refund, the paid subscriber badge, payout setup, a
// tip, and the rule that a repeated webhook changes nothing. Stripe is replaced by e2e/lib/stripe-mock.mjs, which answers
// the same requests and sends the same signed webhook events. The area runs only when E2E_STRIPE=1 and the server was
// started with the Stripe test settings (e2e/stripe.env). Without them it says so and skips.
import { area, assert, check, guard, note } from "./lib/harness.mjs"
import { BASE, TIMEOUT, randomWord, RUN_ID } from "./lib/env.mjs"
import { createUser } from "./lib/accounts.mjs"
import { execute, query } from "./lib/db.mjs"
import { startStripeMock } from "./lib/stripe-mock.mjs"
import { card, cardMenu, openProfile, waitForPost, writePost } from "./lib/posts.mjs"
import { fillField, formWithButton, go } from "./lib/ui.mjs"

const PORT = Number(process.env.STRIPE_MOCK_PORT || 4555)
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "whsec_e2e"
const ORIGIN = `http://127.0.0.1:${PORT}`

export async function run() {
  area("billing")
  if (!process.env.E2E_STRIPE) {
    note("Skipped. Start the server with e2e/stripe.env and set E2E_STRIPE=1 to run the payment checks.")
    return
  }
  const mock = await startStripeMock({ port: PORT, webhookUrl: `${BASE}/api/stripe/webhook`, webhookSecret: WEBHOOK_SECRET, origin: ORIGIN })
  try {
    await guard("payments", () => paymentFlows(mock))
  } finally {
    await mock.close()
  }
}

// Subscribes the person to Plus through the stand-in checkout, the same way the first check does.
async function subscribePlus(page) {
  await go(page, "/settings/billing", page.getByRole("heading", { name: "Rhenko Plus" }))
  await page.getByRole("button", { name: "Subscribe to Plus", exact: true }).click()
  await page.waitForURL((url) => url.origin === ORIGIN && url.pathname.startsWith("/pay/"), { timeout: TIMEOUT })
  await page.getByRole("button", { name: "Subscribe", exact: true }).click()
  await page.waitForURL((url) => url.pathname === "/settings/billing" && url.searchParams.get("checkout") === "done", { timeout: TIMEOUT })
}

async function userId(handle) {
  const rows = await query("SELECT id FROM users WHERE handle = ?", handle)
  return rows[0]?.id
}

async function paymentFlows(mock) {
  const payer = await createUser({ tag: "bpay" })
  const creator = await createUser({ tag: "bcre" })
  const tipper = await createUser({ tag: "btip" })
  const unconfirmed = await createUser({ tag: "bnot" })
  // Confirmed email for everyone except the account that tests the rule that paid verification needs one.
  await execute("UPDATE users SET email_verified_at = ? WHERE handle IN (?, ?, ?)", Date.now(), payer.handle, creator.handle, tipper.handle)

  await check("the billing page shows Plus at the price Stripe reports", async () => {
    await go(payer.page, "/settings/billing", payer.page.getByRole("heading", { name: "Rhenko Plus" }))
    await payer.page.getByText("$4.99 a month").first().waitFor({ timeout: TIMEOUT })
    await payer.page.getByRole("button", { name: "Subscribe to Plus", exact: true }).waitFor()
  })

  await check("Plus starts through Stripe's checkout, and the page then shows when it renews", async () => {
    await payer.page.getByRole("button", { name: "Subscribe to Plus", exact: true }).click()
    await payer.page.waitForURL((url) => url.origin === ORIGIN && url.pathname.startsWith("/pay/"), { timeout: TIMEOUT })
    await payer.page.getByRole("button", { name: "Subscribe", exact: true }).click()
    await payer.page.waitForURL((url) => url.pathname === "/settings/billing" && url.searchParams.get("checkout") === "done", { timeout: TIMEOUT })
    await payer.page.getByText("Thanks. Your subscription shows here").waitFor()
    await payer.page.getByText(/Plus renews/).waitFor({ timeout: TIMEOUT })
    const rows = await query("SELECT kind, status FROM subscriptions WHERE user_id = ?", await userId(payer.handle))
    assert.equal(rows.length, 1, "one subscription row")
    assert.equal(rows[0].kind, "plus")
    assert.equal(rows[0].status, "active")
  })

  await check("paid subscriber badge needs a confirmed email address", async () => {
    await go(unconfirmed.page, "/settings/billing", unconfirmed.page.getByRole("heading", { name: "Paid subscriber badge" }))
    await unconfirmed.page.getByText("Confirm your email address first").waitFor()
    assert.equal(await unconfirmed.page.getByRole("button", { name: "Get the subscriber badge" }).isDisabled(), true, "the badge button is enabled without a confirmed email")
  })

  await check("the paid subscriber badge is subscribed through checkout and shows on the person's posts", async () => {
    await go(payer.page, "/settings/billing", payer.page.getByRole("heading", { name: "Paid subscriber badge" }))
    await payer.page.getByRole("button", { name: "Get the subscriber badge", exact: true }).click()
    await payer.page.waitForURL((url) => url.origin === ORIGIN && url.pathname.startsWith("/pay/"), { timeout: TIMEOUT })
    await payer.page.getByRole("button", { name: "Subscribe", exact: true }).click()
    await payer.page.waitForURL((url) => url.pathname === "/settings/billing" && url.searchParams.get("checkout") === "done", { timeout: TIMEOUT })
    await payer.page.getByText(/The badge renews/).waitFor({ timeout: TIMEOUT })
    const text = `Badge post ${RUN_ID}${randomWord(4)}`
    await writePost(payer.page, text)
    await waitForPost(payer.page, text)
    await openProfile(creator.page, payer.handle)
    await waitForPost(creator.page, text)
    const shown = card(creator.page, text)
    await shown.getByRole("img", { name: /Paid subscriber\. Rhenko has not checked this person's identity\./ }).first().waitFor({ timeout: TIMEOUT })
    assert.equal(await shown.getByRole("img", { name: "Verified account" }).count(), 0, "the paid badge was shown as the verified badge")
  })

  await check("Plus can be withdrawn within 14 days, and the first payment is refunded", async () => {
    await go(payer.page, "/settings/billing", payer.page.getByRole("heading", { name: "Rhenko Plus" }))
    const before = mock.state.refunds.length
    await payer.page.getByRole("button", { name: "Withdraw", exact: true }).click()
    await payer.page.getByRole("button", { name: "Withdraw and refund", exact: true }).click()
    await payer.page.getByRole("button", { name: "Subscribe to Plus", exact: true }).waitFor({ timeout: TIMEOUT })
    assert.equal(mock.state.refunds.length, before + 1, "no refund was made")
    const rows = await query("SELECT status FROM subscriptions WHERE user_id = ? AND kind = 'plus'", await userId(payer.handle))
    assert.equal(rows.every((row) => row.status === "canceled"), true, "a Plus row is still active")
  })

  await check("payout setup returns from Stripe with payouts ready", async () => {
    await go(creator.page, "/settings/billing", creator.page.getByRole("heading", { name: "Tips and payouts" }))
    await creator.page.getByRole("button", { name: "Set up payouts", exact: true }).click()
    await creator.page.waitForURL((url) => url.pathname === "/settings/billing" && url.searchParams.get("payouts") === "return", { timeout: TIMEOUT })
    await creator.page.getByText("Payout details saved.").waitFor()
    await creator.page.getByText("Payouts are ready.").waitFor({ timeout: TIMEOUT })
  })

  const tipText = `Tip post ${RUN_ID}${randomWord(4)}`
  await check("a tip goes through Stripe, with Rhenko's share kept, and the creator sees it", async () => {
    await writePost(creator.page, tipText)
    await waitForPost(creator.page, tipText)
    await openProfile(tipper.page, creator.handle)
    await waitForPost(tipper.page, tipText)
    await cardMenu(tipper.page, card(tipper.page, tipText), `Tip @${creator.handle}`)
    await tipper.page.getByRole("button", { name: "Tip $5.00", exact: true }).click()
    await tipper.page.waitForURL((url) => url.origin === ORIGIN && url.pathname.startsWith("/pay/"), { timeout: TIMEOUT })
    await tipper.page.getByRole("button", { name: "Pay", exact: true }).click()
    await tipper.page.waitForURL((url) => url.pathname.includes("/status/") && url.searchParams.get("tip") === "thanks", { timeout: TIMEOUT })
    const rows = await query("SELECT amount, fee, status FROM tips WHERE to_user_id = ?", await userId(creator.handle))
    assert.equal(rows.length, 1, "one tip recorded")
    assert.equal(rows[0].amount, 500, "tip amount")
    assert.equal(rows[0].fee, 50, "Rhenko's share of a $5.00 tip at 10%")
    assert.equal(rows[0].status, "paid")
    await go(creator.page, "/settings/billing", creator.page.getByRole("heading", { name: "Tips and payouts" }))
    await creator.page.getByText("1 tip received, $4.50 after Rhenko's share.").waitFor({ timeout: TIMEOUT })
  })

  await check("a repeated webhook for a tip changes nothing", async () => {
    const tipEvent = mock.state.events.find((event) => event.type === "checkout.session.completed" && event.data.object.metadata?.kind === "tip")
    assert.ok(tipEvent, "the tip event was not sent")
    const status = await mock.redeliver(tipEvent)
    assert.equal(status, 200, "the repeated event was not accepted")
    const rows = await query("SELECT COUNT(*) AS n FROM tips WHERE to_user_id = ?", await userId(creator.handle))
    assert.equal(rows[0].n, 1, "the repeated event recorded a second tip")
  })

  await check("deactivating or deleting an account stops its Plus renewing, and a late webhook for a deleted account is accepted and ignored", async () => {
    const closer = await createUser({ tag: "bcls" })
    const deleter = await createUser({ tag: "bdel" })
    await execute("UPDATE users SET email_verified_at = ? WHERE handle IN (?, ?)", Date.now(), closer.handle, deleter.handle)
    await subscribePlus(closer.page)
    await subscribePlus(deleter.page)
    const closerSub = await query("SELECT id FROM subscriptions WHERE user_id = ? AND kind = 'plus' AND status = 'active'", await userId(closer.handle))
    const deleterSub = await query("SELECT id FROM subscriptions WHERE user_id = ? AND kind = 'plus' AND status = 'active'", await userId(deleter.handle))
    assert.equal(closerSub.length, 1, "the deactivated account has no active Plus subscription to end")
    assert.equal(deleterSub.length, 1, "the deleted account has no active Plus subscription to end")

    await closer.page.goto(`${BASE}/settings/account`, { waitUntil: "domcontentloaded" })
    const deactivate = formWithButton(closer.page, "Deactivate account")
    await fillField(deactivate, "password", closer.password)
    await deactivate.getByRole("button", { name: "Deactivate account", exact: true }).click()
    await closer.page.waitForURL((url) => url.pathname === "/login", { timeout: TIMEOUT })
    assert.equal(mock.state.subscriptions.get(closerSub[0].id)?.cancel_at_period_end, true, "deactivating left the subscription renewing")
    const closerRow = await query("SELECT cancel_at_period_end AS c FROM subscriptions WHERE id = ?", closerSub[0].id)
    assert.equal(closerRow[0]?.c, 1, "the subscription record does not show that it ends")

    await deleter.page.goto(`${BASE}/settings/account`, { waitUntil: "domcontentloaded" })
    const remove = formWithButton(deleter.page, "Delete account forever")
    await fillField(remove, "password", deleter.password)
    await fillField(remove, "confirm", `@${deleter.handle}`)
    await remove.getByRole("button", { name: "Delete account forever", exact: true }).click()
    await deleter.page.waitForURL((url) => url.pathname !== "/settings/account", { timeout: TIMEOUT })
    assert.equal((await query("SELECT id FROM users WHERE handle = ?", deleter.handle)).length, 0, "the account was not deleted")
    assert.equal(mock.state.subscriptions.get(deleterSub[0].id)?.cancel_at_period_end, true, "deleting left the subscription renewing")

    const late = mock.state.subscriptions.get(deleterSub[0].id)
    const { status } = await mock.deliver("customer.subscription.updated", late)
    assert.equal(status, 200, `a webhook for a deleted account answered ${status}, and Stripe would send it again`)
  })

  await check("a webhook without a valid signature is refused", async () => {
    const response = await fetch(`${BASE}/api/stripe/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "Stripe-Signature": "t=1,v1=bad" }, body: "{}" })
    assert.equal(response.status, 400, `answered ${response.status}`)
  })
}
