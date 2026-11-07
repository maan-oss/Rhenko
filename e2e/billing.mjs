// Payments end to end: Rhenko Plus through Stripe's checkout and what it includes (no ads in the home feed, the paid subscriber
// ring, an animated profile picture, longer videos), withdrawal with a refund, the older badge subscription, payout setup, a tip,
// and the rule that a repeated webhook changes nothing. Stripe is replaced by e2e/lib/stripe-mock.mjs, which answers the same
// requests and sends the same signed webhook events. The area runs only when E2E_STRIPE=1 and the server was started with the
// Stripe test settings (e2e/stripe.env). Without them it says so and skips.
import fs from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { area, assert, check, guard, note } from "./lib/harness.mjs"
import { BASE, TIMEOUT, randomWord, RUN_ID } from "./lib/env.mjs"
import { createUser } from "./lib/accounts.mjs"
import { execute, query } from "./lib/db.mjs"
import { startStripeMock } from "./lib/stripe-mock.mjs"
import { attach, card, cardMenu, homeComposer, openHome, openProfile, typeIn, waitForPost, writePost } from "./lib/posts.mjs"
import { follow } from "./lib/people.mjs"
import { fillField, formWithButton, go, acted, toastText } from "./lib/ui.mjs"
import { makeGif, makePng, makeVideo } from "./lib/files.mjs"

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

// Puts a file in a file input without the page's change handler running. The form then sends it as it is, so this checks what the
// server does with a file the picker would have turned away.
async function sendFileQuietly(input, file) {
  const base64 = fs.readFileSync(file).toString("base64")
  await input.evaluate((element, { base64: data, name, type }) => {
    const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0))
    const transfer = new DataTransfer()
    transfer.items.add(new File([bytes], name, { type }))
    element.files = transfer.files
  }, { base64, name: path.basename(file), type: "image/gif" })
}

// One approved campaign with no topic and a funded balance, written the way scripts/ads.mjs approves one. Anyone whose home feed
// has enough posts (eight) sees it, so it is the ad the feed checks look for.
async function seedAd(advertiser) {
  const now = Date.now()
  const accountId = randomUUID()
  const micro = 100 * 100 * 10_000 // $100, in micro-units: a cent is 10,000 (lib/ad-rules.ts)
  await execute(
    "INSERT INTO ad_accounts (id, user_id, business_name, country, contact_email, currency, balance_micro, status, policy_accepted_at, created_at) VALUES (?, (SELECT id FROM users WHERE handle = ?), ?, 'AU', ?, 'usd', ?, 'active', ?, ?)",
    accountId,
    advertiser.handle,
    `Knife Works ${RUN_ID}`,
    `ads-${RUN_ID}@example.com`,
    micro,
    now,
    now
  )
  await execute(
    "INSERT INTO ad_campaigns (id, account_id, headline, body, cta, link_url, budget_micro, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)",
    randomUUID(),
    accountId,
    `Sharp knives ${RUN_ID}`,
    "A sharpening kit for home cooks.",
    "See the kit",
    "https://example.com/knives",
    micro,
    now
  )
}

async function paymentFlows(mock) {
  const payer = await createUser({ tag: "bpay" })
  const creator = await createUser({ tag: "bcre" })
  const tipper = await createUser({ tag: "btip" })
  const unconfirmed = await createUser({ tag: "bnot" })
  const advertiser = await createUser({ tag: "badv" })
  // Confirmed email for everyone except the account that tests the rule that Plus needs one.
  await execute("UPDATE users SET email_verified_at = ? WHERE handle IN (?, ?, ?)", Date.now(), payer.handle, creator.handle, tipper.handle)

  await check("the billing page shows Plus at the price Stripe reports, with what it includes", async () => {
    await go(payer.page, "/settings/billing", payer.page.getByRole("heading", { name: "Rhenko Plus" }))
    await payer.page.getByText("$4.99 a month").first().waitFor({ timeout: TIMEOUT })
    await payer.page.getByText("The paid subscriber ring beside your name").waitFor()
    await payer.page.getByText("Videos up to 10 minutes long").waitFor()
    await payer.page.getByRole("button", { name: "Subscribe to Plus", exact: true }).waitFor()
    assert.equal(await payer.page.getByRole("heading", { name: "Paid subscriber badge", exact: true }).count(), 0, "the badge-only product is still offered")
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

  await check("Rhenko Plus needs a confirmed email address before it can be bought", async () => {
    await go(unconfirmed.page, "/settings/billing", unconfirmed.page.getByRole("heading", { name: "Rhenko Plus" }))
    await unconfirmed.page.getByText("Confirm your email address first. Rhenko Plus needs one.").waitFor({ timeout: TIMEOUT })
    assert.equal(await unconfirmed.page.getByRole("button", { name: "Subscribe to Plus", exact: true }).isDisabled(), true, "Subscribe is enabled without a confirmed email")
  })

  await check("Plus shows the paid subscriber ring on the person's posts, and never the verified check", async () => {
    const text = `Ring post ${RUN_ID}${randomWord(4)}`
    await writePost(payer.page, text)
    await openProfile(payer.page, payer.handle)
    await waitForPost(payer.page, text)
    await openProfile(creator.page, payer.handle)
    await waitForPost(creator.page, text)
    const shown = card(creator.page, text)
    await shown.getByRole("img", { name: /Paid subscriber\. Rhenko has not checked this person's identity\./ }).first().waitFor({ timeout: TIMEOUT })
    assert.equal(await shown.getByRole("img", { name: "Verified account" }).count(), 0, "the paid ring was shown as the verified check")
  })

  await check("a Plus subscriber's home feed has no ads, and a free adult's home feed has one", async () => {
    await follow(tipper.page, creator.handle)
    await follow(payer.page, creator.handle)
    let last = ""
    for (let i = 1; i <= 8; i++) {
      last = `Feed post ${i} ${RUN_ID}${randomWord(4)}`
      await writePost(creator.page, last)
    }
    await seedAd(advertiser)
    // The Following tab, not For you: For you reuses a ranking made up to a minute earlier (RANKED_REUSE_MS in lib/data.ts),
    // and that ranking can predate these posts. The ads are chosen the same way on both tabs (lib/feeds.ts).
    await openHome(tipper.page, "following")
    await tipper.page.locator('article[aria-label^="Ad from"]').first().waitFor({ timeout: TIMEOUT })
    await openHome(payer.page, "following")
    // The Plus viewer must actually see the posts, so an empty feed cannot pass the no-ad check.
    await waitForPost(payer.page, last, { reload: true })
    assert.equal(await payer.page.locator('article[aria-label^="Ad from"]').count(), 0, "a Plus subscriber saw an ad in the home feed")
  })

  await check("a person who follows a Plus subscriber sees the paid ring on them in Priority settings", async () => {
    await follow(creator.page, payer.handle)
    await go(creator.page, "/settings/notifications", creator.page.getByRole("heading", { name: "Priority", exact: true }))
    const row = creator.page.getByRole("switch", { name: `Priority notifications from ${payer.name}` })
    await row.waitFor({ timeout: TIMEOUT })
    await row.getByRole("img", { name: /Paid subscriber\. Rhenko has not checked this person's identity\./ }).waitFor()
  })

  await check("a free account is asked to trim a video longer than 2 minutes 20 seconds", async () => {
    await openHome(creator.page)
    const form = homeComposer(creator.page)
    await typeIn(form, `Long clip ${RUN_ID}${randomWord(4)}`)
    await attach(form, makeVideo(`free-150-${RUN_ID}.webm`, 150))
    await creator.page.getByText(/A post can carry up to 2:20/).waitFor({ timeout: TIMEOUT })
    await creator.page.keyboard.press("Escape")
  })

  await check("Plus posts a 5 minute video whole, without a trim", async () => {
    await openHome(payer.page)
    const text = `Five minute clip ${RUN_ID}${randomWord(4)}`
    const form = homeComposer(payer.page)
    await typeIn(form, text)
    await attach(form, makeVideo(`plus-300-${RUN_ID}.webm`, 300))
    await acted(payer.page, () => form.getByRole("button", { name: "Post", exact: true }).click())
    await toastText(payer.page, /^Posted\./)
    assert.equal(await payer.page.getByText(/A post can carry up to/).count(), 0, "Plus was asked to trim a 5 minute video")
  })

  await check("an animated profile picture is refused for a free account and kept for Plus, and a still picture still works", async () => {
    const gif = makeGif(`avatar-${RUN_ID}.gif`)
    await openProfile(creator.page, creator.handle)
    await creator.page.getByRole("button", { name: "Edit profile", exact: true }).click()
    const dialog = creator.page.getByRole("dialog", { name: "Edit profile" })
    // The picker refuses it before anything is sent.
    await dialog.locator("input[name=avatar]").setInputFiles(gif)
    await toastText(creator.page, /Animated profile pictures are part of Rhenko Plus/)
    // The server refuses it too, for a form that sends the file anyway.
    await sendFileQuietly(dialog.locator("input[name=avatar]"), gif)
    await dialog.getByRole("button", { name: "Save profile", exact: true }).click()
    await dialog.getByRole("alert").getByText(/Animated profile pictures are part of Rhenko Plus/).waitFor({ timeout: TIMEOUT })
    const refused = await query("SELECT avatar_file FROM users WHERE handle = ?", creator.handle)
    assert.ok(!String(refused[0]?.avatar_file ?? "").endsWith(".gif"), "a free account's GIF was kept")
    // A still picture is framed and kept as before.
    await dialog.locator("input[name=avatar]").setInputFiles(makePng(`still-${RUN_ID}.png`, { seed: 21 }))
    await creator.page.getByRole("dialog", { name: "Position your photo" }).getByRole("button", { name: "Use this", exact: true }).click()
    await dialog.getByRole("button", { name: "Save profile", exact: true }).click()
    await toastText(creator.page, /^Profile saved\./)
    const still = await query("SELECT avatar_file FROM users WHERE handle = ?", creator.handle)
    assert.ok(still[0]?.avatar_file && !still[0].avatar_file.endsWith(".gif"), "a still picture was not kept")

    await openProfile(payer.page, payer.handle)
    await payer.page.getByRole("button", { name: "Edit profile", exact: true }).click()
    const payerDialog = payer.page.getByRole("dialog", { name: "Edit profile" })
    await payerDialog.locator("input[name=avatar]").setInputFiles(gif)
    await payerDialog.getByRole("button", { name: "Save profile", exact: true }).click()
    await toastText(payer.page, /^Profile saved\./)
    const animated = await query("SELECT avatar_file FROM users WHERE handle = ?", payer.handle)
    assert.ok(animated[0]?.avatar_file?.endsWith(".gif"), "the Plus subscriber's animated picture was not kept as a GIF")
  })

  await check("Plus can edit a post a day after it was posted, and a free account is not offered the edit after an hour", async () => {
    const older = `Older post ${RUN_ID}${randomWord(4)}`
    const freeOlder = `Free older post ${RUN_ID}${randomWord(4)}`
    await writePost(payer.page, older)
    await writePost(creator.page, freeOlder)
    // Two hours back: past the hour a free account may edit for, inside the day Plus allows.
    await execute("UPDATE posts SET created_at = ? WHERE body IN (?, ?)", Date.now() - 2 * 60 * 60 * 1000, older, freeOlder)
    await openProfile(payer.page, payer.handle)
    await cardMenu(payer.page, await waitForPost(payer.page, older), "Edit post")
    const dialog = payer.page.getByRole("dialog", { name: "Edit post" })
    await dialog.waitFor()
    await dialog.getByLabel("Post text").fill(`${older} edited`)
    await acted(payer.page, () => dialog.getByRole("button", { name: "Save", exact: true }).click())
    await toastText(payer.page, /Post updated/)
    await openProfile(creator.page, creator.handle)
    const freeTarget = await waitForPost(creator.page, freeOlder)
    await freeTarget.getByRole("button", { name: "More options" }).click()
    assert.equal(await creator.page.getByRole("menuitem", { name: "Edit post", exact: true }).count(), 0, "a free account was offered an edit after an hour")
    await creator.page.keyboard.press("Escape")
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
    const ring = await query("SELECT paid_verified FROM users WHERE handle = ?", payer.handle)
    assert.equal(Number(ring[0].paid_verified), 0, "the paid ring stayed on after Plus was withdrawn")
  })

  await check("a subscriber to the older badge, from before Plus included the ring, keeps the ring and can still manage it", async () => {
    const older = await createUser({ tag: "bold" })
    const olderId = await userId(older.handle)
    const now = Math.floor(Date.now() / 1000)
    // The older badge subscription, as Stripe reports it. Its kind is 'verified', which still counts for the ring.
    const { status } = await mock.deliver("customer.subscription.created", {
      id: `sub_older_${RUN_ID}${randomWord(3)}`,
      object: "subscription",
      customer: `cus_older_${RUN_ID}${randomWord(3)}`,
      status: "active",
      cancel_at_period_end: false,
      created: now,
      metadata: { user_id: olderId, kind: "verified" },
      items: { object: "list", data: [{ price: { id: "price_verified_e2e" }, current_period_end: now + 30 * 24 * 60 * 60 }] },
    })
    assert.equal(status, 200, `the older badge webhook answered ${status}`)
    const ring = await query("SELECT paid_verified FROM users WHERE id = ?", olderId)
    assert.equal(Number(ring[0].paid_verified), 1, "the older badge did not turn the ring on")
    await go(older.page, "/settings/billing", older.page.getByRole("heading", { name: "Your older subscriber badge" }))
    await older.page.getByRole("button", { name: "Manage billing", exact: true }).first().waitFor()
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
    await openProfile(creator.page, creator.handle)
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

  await check("deleting an account keeps its subscription record for five years, without the account's id or handle", async () => {
    const deleter = await createUser({ tag: "bkeep" })
    await execute("UPDATE users SET email_verified_at = ? WHERE handle = ?", Date.now(), deleter.handle)
    await subscribePlus(deleter.page)
    const id = await userId(deleter.handle)
    const subs = await query("SELECT created_at FROM subscriptions WHERE user_id = ?", id)
    assert.equal(subs.length, 1, "the account has no subscription record to keep")

    await deleter.page.goto(`${BASE}/settings/account`, { waitUntil: "domcontentloaded" })
    const remove = formWithButton(deleter.page, "Delete account forever")
    await fillField(remove, "password", deleter.password)
    await fillField(remove, "confirm", `@${deleter.handle}`)
    await remove.getByRole("button", { name: "Delete account forever", exact: true }).click()
    await deleter.page.waitForURL((url) => url.pathname !== "/settings/account", { timeout: TIMEOUT })
    assert.equal((await query("SELECT id FROM users WHERE id = ?", id)).length, 0, "the account was not deleted")

    const kept = await query(
      "SELECT source, detail, occurred_at, keep_until, to_jsonb(f)::text AS doc FROM financial_records f WHERE source = 'subscription' AND occurred_at = ?",
      subs[0].created_at
    )
    assert.equal(kept.length, 1, "the subscription record of the deleted account was not kept")
    assert.equal(kept[0].detail, "plus", "the kept record does not say which subscription it was")
    assert.equal(
      Number(kept[0].keep_until) - Number(kept[0].occurred_at),
      5 * 365 * 24 * 60 * 60 * 1000,
      "the kept record is not set to be removed five years after its payment"
    )
    assert.equal(kept[0].doc.includes(id), false, "the kept record still holds the account's id")
    assert.equal(kept[0].doc.includes(deleter.handle), false, "the kept record still holds the account's handle")
  })

  await check("a webhook without a valid signature is refused", async () => {
    const response = await fetch(`${BASE}/api/stripe/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "Stripe-Signature": "t=1,v1=bad" }, body: "{}" })
    assert.equal(response.status, 400, `answered ${response.status}`)
  })
}
