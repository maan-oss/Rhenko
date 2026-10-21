// Advertising end to end: setting up an account, a campaign that waits for review, approval by the review script, an ad
// in the home feed for an adult who may see it, the click counter, the rule that a second view the same day is not
// charged again, and the people who must not see ads (under 18, Plus subscribers, people who do not follow the topic).
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { area, assert, check, guard } from "./lib/harness.mjs"
import { BASE, DATA_DIR, RUN_ID, TIMEOUT, randomWord } from "./lib/env.mjs"
import { createUser } from "./lib/accounts.mjs"
import { execute, query } from "./lib/db.mjs"
import { go } from "./lib/ui.mjs"
import { openHome } from "./lib/posts.mjs"

const execFileAsync = promisify(execFile)
const runScript = (args, options) => execFileAsync("node", args, options)
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

export async function run() {
  area("ads")
  const token = `${RUN_ID}${randomWord(3)}`
  const advertiser = await createUser({ tag: "adv" })
  const adult = await createUser({ tag: "rdr" })
  const plusReader = await createUser({ tag: "rpl" })
  const stranger = await createUser({ tag: "rst" })
  const minor = await createUser({ tag: "rmi" })
  const headline = `Sharp knives ${token}`
  const businessName = `Knife Works ${token}`
  let campaignId = ""

  await guard("advertising", async () => {
    await check("an adult sets up an advertising account with the policy accepted", async () => {
      await go(advertiser.page, "/advertise", advertiser.page.getByRole("heading", { name: "Set up advertising" }))
      await advertiser.page.locator("input[name=business_name]").fill(businessName)
      await advertiser.page.locator("input[name=country]").fill("AU")
      await advertiser.page.locator("input[name=contact_email]").fill(`ads-${token}@example.com`)
      await advertiser.page.getByRole("button", { name: "Set up advertising", exact: true }).click()
      await advertiser.page.locator("input[name=accept_policy]").check()
      await advertiser.page.getByRole("button", { name: "Set up advertising", exact: true }).click()
      await advertiser.page.getByRole("heading", { name: businessName }).waitFor({ timeout: TIMEOUT })
    })

    await check("a campaign that breaks the policy is refused before it is sent", async () => {
      await advertiser.page.locator("input[name=headline]").fill(`Vote for us ${token}`)
      await advertiser.page.locator("textarea[name=body]").fill("Vote for the candidate who sells knives.")
      await advertiser.page.locator("input[name=cta]").fill("Learn more")
      await advertiser.page.locator("input[name=link]").fill("https://example.com/vote")
      await advertiser.page.locator("input[name=budget]").fill("10")
      await advertiser.page.getByRole("button", { name: "Send for review", exact: true }).click()
      await advertiser.page.getByText("Political ads are not allowed.").waitFor({ timeout: TIMEOUT })
    })

    await check("a campaign is sent for review and waits there", async () => {
      await advertiser.page.locator("input[name=headline]").fill(headline)
      await advertiser.page.locator("textarea[name=body]").fill("A sharpening kit for home cooks, with a lifetime edge.")
      await advertiser.page.locator("input[name=cta]").fill("See the kit")
      await advertiser.page.locator("input[name=link]").fill("https://example.com/knives")
      await advertiser.page.locator("input[name=topic]").fill("#Cooking")
      await advertiser.page.locator("input[name=budget]").fill("25.00")
      await advertiser.page.getByRole("button", { name: "Send for review", exact: true }).click()
      await advertiser.page.getByText("Sent for review.").waitFor({ timeout: TIMEOUT })
      await advertiser.page.getByText("Waiting for review").first().waitFor({ timeout: TIMEOUT })
      const rows = await query("SELECT id, status, topic FROM ad_campaigns WHERE headline = ?", headline)
      assert.equal(rows.length, 1, "the campaign was not stored")
      assert.equal(rows[0].status, "in_review")
      assert.equal(rows[0].topic, "cooking", "the topic was not stored without its #, in lower case")
      campaignId = rows[0].id
    })

    await check("the review script approves a campaign once the account has a balance", async () => {
      const accountRows = await query("SELECT id FROM ad_accounts WHERE user_id = (SELECT id FROM users WHERE handle = ?)", advertiser.handle)
      const accountId = accountRows[0].id
      const refusal = await runScript(["scripts/ads.mjs", "approve", campaignId], { cwd: REPO, env: { ...process.env, RHENKO_DATA_DIR: DATA_DIR } }).catch((error) => error)
      assert.ok(refusal.code === 1 && /no balance/.test(refusal.stderr), `approval without a balance should be refused: ${refusal.stderr}`)
      // A balance as Stripe would record it: one credit row under a unique reference, and the account's balance.
      const cents = 10_000
      await execute(
        "INSERT INTO ad_ledger (id, account_id, kind, amount_micro, reference, created_at) VALUES (?, ?, 'credit', ?, ?, ?)",
        `e2e-${token}`,
        accountId,
        cents * 10_000,
        `e2e-${token}`,
        Date.now()
      )
      await execute("UPDATE ad_accounts SET balance_micro = balance_micro + ? WHERE id = ?", cents * 10_000, accountId)
      const { stdout } = await runScript(["scripts/ads.mjs", "approve", campaignId], { cwd: REPO, env: { ...process.env, RHENKO_DATA_DIR: DATA_DIR } })
      assert.match(stdout, /Approved/)
      const rows = await query("SELECT status FROM ad_campaigns WHERE id = ?", campaignId)
      assert.equal(rows[0].status, "active")
      const decisions = await query("SELECT COUNT(*) AS n FROM ad_decisions WHERE target = ? AND action = 'ad_approved'", campaignId)
      assert.equal(decisions[0].n, 1, "the decision was not recorded")
    })

    await check("the advertiser sees the campaign running", async () => {
      await go(advertiser.page, "/advertise", advertiser.page.getByRole("heading", { name: "Campaigns" }))
      await advertiser.page.getByText("Running").first().waitFor({ timeout: TIMEOUT })
    })

    await check("an adult who follows the topic sees the ad, labelled Ad, and a second view that day is not charged", async () => {
      await execute("INSERT INTO topic_follows (user_id, tag, created_at) VALUES ((SELECT id FROM users WHERE handle = ?), 'cooking', ?)", adult.handle, Date.now())
      await openHome(adult.page)
      const ad = adult.page.locator(`article[aria-label="Ad from ${businessName}"]`).first()
      await ad.waitFor({ timeout: TIMEOUT })
      assert.match((await ad.innerText()).trim(), /^Ad\b/, "the ad is not labelled Ad")
      assert.ok(await ad.getByText(headline).count(), "the ad does not show its headline")
      const once = await query("SELECT impressions FROM ad_campaigns WHERE id = ?", campaignId)
      assert.equal(once[0].impressions, 1, "the first view was not counted once")
      await adult.page.reload({ waitUntil: "domcontentloaded" })
      await adult.page.locator(`article[aria-label="Ad from ${businessName}"]`).first().waitFor({ timeout: TIMEOUT })
      const twice = await query("SELECT impressions, spent_micro FROM ad_campaigns WHERE id = ?", campaignId)
      assert.equal(twice[0].impressions, 1, "a second view the same day was charged again")
      assert.equal(twice[0].spent_micro, 2000, "the charge is not the rate for one impression")
    })

    await check("the button counts a click and goes to the advertiser's address", async () => {
      const response = await fetch(`${BASE}/api/ads/click/${campaignId}`, { redirect: "manual" })
      assert.equal(response.status, 302, `the click answered ${response.status}`)
      assert.equal(response.headers.get("location"), "https://example.com/knives")
      const rows = await query("SELECT clicks FROM ad_campaigns WHERE id = ?", campaignId)
      assert.equal(rows[0].clicks, 1, "the click was not counted")
    })

    await check("repeated clicks from one person stop counting after the hourly limit, and each still reaches the advertiser", async () => {
      for (let i = 0; i < 25; i++) {
        const again = await fetch(`${BASE}/api/ads/click/${campaignId}`, { redirect: "manual" })
        assert.equal(again.status, 302, `click ${i + 2} answered ${again.status}`)
        assert.equal(again.headers.get("location"), "https://example.com/knives", `click ${i + 2} went somewhere else`)
      }
      const rows = await query("SELECT clicks FROM ad_campaigns WHERE id = ?", campaignId)
      assert.equal(rows[0].clicks, 20, "the clicks were not capped at the hourly limit")
    })

    await check("a person reports the ad, the report is stored, and the review script lists it", async () => {
      const ad = adult.page.locator(`article[aria-label="Ad from ${businessName}"]`).first()
      await ad.getByRole("button", { name: "Report ad" }).click()
      const dialog = adult.page.getByRole("dialog", { name: "Report this ad" })
      await dialog.waitFor({ timeout: TIMEOUT })
      await dialog.getByLabel("It is misleading or a scam").check()
      await dialog.getByRole("button", { name: "Send report", exact: true }).click()
      await adult.page.getByText("Thanks. The report has been sent for review.").waitFor({ timeout: TIMEOUT })
      const rows = await query("SELECT reason, reporter_id FROM ad_reports WHERE campaign_id = ?", campaignId)
      assert.equal(rows.length, 1, "the report was not stored")
      assert.equal(rows[0].reason, "misleading")
      const listing = await runScript(["scripts/ads.mjs", "reports"], { cwd: REPO, env: { ...process.env, RHENKO_DATA_DIR: DATA_DIR } })
      assert.match(listing.stdout, new RegExp(`${campaignId}[\\s\\S]*reason: misleading`), "the review script does not list the report")
    })

    await check("a stranger who does not follow the topic does not see the ad", async () => {
      await openHome(stranger.page)
      await stranger.page.waitForTimeout(1500)
      assert.equal(await stranger.page.locator(`article[aria-label="Ad from ${businessName}"]`).count(), 0, "the topic ad reached someone who does not follow it")
    })

    await check("a Plus subscriber sees no ads", async () => {
      await execute(
        "INSERT INTO subscriptions (id, user_id, kind, status, cancel_at_period_end, current_period_end, created_at, updated_at) VALUES (?, (SELECT id FROM users WHERE handle = ?), 'plus', 'active', 0, ?, ?, ?)",
        `e2e-plus-${token}`,
        plusReader.handle,
        Date.now() + 86_400_000,
        Date.now(),
        Date.now()
      )
      await execute("INSERT INTO topic_follows (user_id, tag, created_at) VALUES ((SELECT id FROM users WHERE handle = ?), 'cooking', ?)", plusReader.handle, Date.now())
      await openHome(plusReader.page)
      await plusReader.page.waitForTimeout(1500)
      assert.equal(await plusReader.page.locator('article[aria-label^="Ad from"]').count(), 0, "a Plus subscriber saw an ad")
    })

    await check("a person under 18 sees no ads", async () => {
      const birth = `${new Date().getUTCFullYear() - 10}-01-01`
      await execute("UPDATE users SET birthday = ? WHERE handle = ?", birth, minor.handle)
      await execute("INSERT INTO topic_follows (user_id, tag, created_at) VALUES ((SELECT id FROM users WHERE handle = ?), 'cooking', ?)", minor.handle, Date.now())
      await openHome(minor.page)
      await minor.page.waitForTimeout(1500)
      assert.equal(await minor.page.locator('article[aria-label^="Ad from"]').count(), 0, "a person under 18 saw an ad")
    })

    await check("the ad library lists the campaign publicly", async () => {
      await go(stranger.page, "/transparency/ads", stranger.page.getByRole("heading", { name: "Ad library" }))
      await stranger.page.getByText(headline).first().waitFor({ timeout: TIMEOUT })
    })

    await check("the review script pauses a campaign, and the advertiser can resume it", async () => {
      await runScript(["scripts/ads.mjs", "pause", campaignId], { cwd: REPO, env: { ...process.env, RHENKO_DATA_DIR: DATA_DIR } })
      await go(advertiser.page, "/advertise", advertiser.page.getByRole("heading", { name: "Campaigns" }))
      await advertiser.page.getByRole("button", { name: "Resume", exact: true }).first().click()
      await advertiser.page.getByText("Running").first().waitFor({ timeout: TIMEOUT })
    })
  })
}
