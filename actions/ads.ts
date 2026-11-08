"use server"

import { revalidatePath } from "next/cache"
import Stripe from "stripe"
import { newId, requireAgreedViewer } from "@/lib/auth"
import { get, run } from "@/lib/db"
import { AD_CAMPAIGNS_WAITING_MAX, BOOST_BUDGETS, MICRO_PER_CENT, boostCopy, campaignProblem, normalizeTopic } from "@/lib/ad-rules"
import { CURRENCY, adCreditUrl, paymentsConfigured } from "@/lib/payments"
import { MINIMUM_AGE } from "@/lib/legal"
import { ageFrom } from "@/lib/rules"
import { boostSetupFor, type BoostSetup } from "@/lib/boost-setup"

export type FormState = { error?: string; done?: boolean }

const REPORT_REASONS = ["misleading", "prohibited", "political", "other"] as const

// A person reports an ad. Nothing about the report reaches the advertiser; a person reads it in scripts/ads.mjs.
export async function reportAd(campaignId: string, reason: string, note: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const viewer = await requireAgreedViewer()
  if (typeof campaignId !== "string" || !/^[0-9a-f-]{36}$/.test(campaignId)) return { ok: false, error: "That ad is not available." }
  if (!(REPORT_REASONS as readonly string[]).includes(reason)) return { ok: false, error: "Choose a reason for the report." }
  const campaign = await get("SELECT c.id FROM ad_campaigns c JOIN ad_accounts a ON a.id = c.account_id WHERE c.id = ? AND c.status IN ('active', 'paused', 'ended')", campaignId)
  if (!campaign) return { ok: false, error: "That ad is not available." }
  await run(
    "INSERT INTO ad_reports (id, campaign_id, reporter_id, reason, note, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(campaign_id, reporter_id) DO UPDATE SET reason = excluded.reason, note = excluded.note, created_at = excluded.created_at",
    newId(),
    campaignId,
    viewer.id,
    reason,
    note.replace(/\s+/g, " ").trim().slice(0, 500) || null,
    Date.now()
  )
  return { ok: true }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const TRY_AGAIN = "Advertising could not be set up. Try again in a moment."

function text(value: FormDataEntryValue | null, max: number): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
}

// Sets up the advertiser's account. Accepting the advertising policy is recorded with the time it was accepted.
export async function createAdAccount(_previous: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireAgreedViewer()
  if (await get("SELECT id FROM ad_accounts WHERE user_id = ?", viewer.id)) return { error: "You already have an advertising account." }
  // The policy is for adults. The advertise page hides the form for anyone else, and this check makes the server refuse too.
  const owner = await get<{ birthday: string | null }>("SELECT birthday FROM users WHERE id = ?", viewer.id)
  const age = owner?.birthday ? ageFrom(owner.birthday) : null
  if (age === null || age < MINIMUM_AGE) return { error: "Advertising is for adults with a birthday on their account." }
  const business = text(formData.get("business_name"), 80)
  const country = text(formData.get("country"), 2).toUpperCase()
  const contact = text(formData.get("contact_email"), 254)
  if (business.length < 2) return { error: "Enter the business name, as customers know it." }
  if (!/^[A-Z]{2}$/.test(country)) return { error: "Use a two-letter country code, such as AU or US." }
  if (!EMAIL.test(contact)) return { error: "Enter a contact email address." }
  if (formData.get("accept_policy") !== "on") return { error: "Read and accept the advertising policy to continue." }
  const now = Date.now()
  await run(
    `INSERT INTO ad_accounts (id, user_id, business_name, country, contact_email, currency, balance_micro, status, policy_accepted_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, 'active', ?, ?)`,
    newId(),
    viewer.id,
    business,
    country,
    contact,
    CURRENCY,
    now,
    now
  )
  revalidatePath("/advertise")
  return { done: true }
}

// Sends a campaign to review. It does not run until a person approves it (scripts/ads.mjs), so nothing is shown unreviewed.
export async function createCampaign(_previous: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireAgreedViewer()
  const account = await get<{ id: string }>("SELECT id FROM ad_accounts WHERE user_id = ?", viewer.id)
  if (!account) return { error: "Set up an advertising account first." }
  const waiting = await get<{ n: number }>("SELECT COUNT(*) AS n FROM ad_campaigns WHERE account_id = ? AND status = 'in_review'", account.id)
  if ((waiting?.n ?? 0) >= AD_CAMPAIGNS_WAITING_MAX) {
    return { error: `You can have ${AD_CAMPAIGNS_WAITING_MAX} campaigns waiting for review. Wait for one to be reviewed.` }
  }
  const amount = Number(text(formData.get("budget"), 12).replace(/,/g, ""))
  if (!Number.isFinite(amount)) return { error: "Enter the budget as an amount, such as 25 or 25.50." }
  const budgetMinor = Math.round(amount * 100)
  if (Math.abs(budgetMinor - amount * 100) > 1e-6) return { error: "The budget can have at most two decimal places." }
  const fields = {
    headline: text(formData.get("headline"), 200),
    body: text(formData.get("body"), 400),
    cta: text(formData.get("cta"), 60),
    link: text(formData.get("link"), 400),
    topic: normalizeTopic(text(formData.get("topic"), 40)),
    budgetMinor,
  }
  const problem = campaignProblem(fields)
  if (problem) return { error: problem }
  await run(
    `INSERT INTO ad_campaigns (id, account_id, headline, body, cta, link_url, picture_file, topic, budget_micro, spent_micro, impressions, clicks, status, review_note, reviewed_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, 0, 0, 0, 'in_review', NULL, NULL, ?)`,
    newId(),
    account.id,
    fields.headline,
    fields.body,
    fields.cta,
    fields.link,
    fields.topic === "" ? null : fields.topic,
    budgetMinor * MICRO_PER_CENT,
    Date.now()
  )
  revalidatePath("/advertise")
  return { done: true }
}

// Pauses a running campaign, or starts a paused one again. Ended, rejected and waiting campaigns cannot be changed here.
export async function setCampaignPaused(campaignId: string, paused: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const viewer = await requireAgreedViewer()
  const row = await get<{ status: string }>(
    "SELECT c.status FROM ad_campaigns c JOIN ad_accounts a ON a.id = c.account_id WHERE c.id = ? AND a.user_id = ?",
    campaignId,
    viewer.id
  )
  if (!row) return { ok: false, error: "That campaign does not exist." }
  if (paused && row.status === "active") await run("UPDATE ad_campaigns SET status = 'paused' WHERE id = ?", campaignId)
  else if (!paused && row.status === "paused") await run("UPDATE ad_campaigns SET status = 'active' WHERE id = ?", campaignId)
  else return { ok: false, error: "This campaign cannot be changed right now." }
  revalidatePath("/advertise")
  return { ok: true }
}

// Ends a boost or campaign for good, or withdraws one still waiting for review. Nothing more is shown, and money not yet spent
// stays in the balance. It cannot be started again, so the page asks first.
export async function endCampaign(campaignId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const viewer = await requireAgreedViewer()
  if (typeof campaignId !== "string" || !/^[0-9a-f-]{36}$/.test(campaignId)) return { ok: false, error: "That campaign does not exist." }
  const row = await get<{ status: string }>(
    "SELECT c.status FROM ad_campaigns c JOIN ad_accounts a ON a.id = c.account_id WHERE c.id = ? AND a.user_id = ?",
    campaignId,
    viewer.id
  )
  if (!row) return { ok: false, error: "That campaign does not exist." }
  if (!["in_review", "active", "paused"].includes(row.status)) return { ok: false, error: "This campaign has already ended." }
  await run("UPDATE ad_campaigns SET status = 'ended' WHERE id = ?", campaignId)
  revalidatePath("/advertise")
  return { ok: true }
}

// Starts a Stripe checkout that adds to the advertising balance. The balance changes only when Stripe confirms the payment.
export async function startAdCredit(amount: number): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const viewer = await requireAgreedViewer()
  if (!paymentsConfigured()) return { ok: false, error: "Payments are not set up on this server yet." }
  const account = await get<{ id: string }>("SELECT id FROM ad_accounts WHERE user_id = ?", viewer.id)
  if (!account) return { ok: false, error: "Set up an advertising account first." }
  try {
    return { ok: true, url: await adCreditUrl(viewer, account.id, amount) }
  } catch (error) {
    if (error instanceof Stripe.errors.StripeError) {
      console.error("stripe request failed", error.type, error.code, error.message)
      return { ok: false, error: "Payments could not start. Try again in a moment." }
    }
    return { ok: false, error: error instanceof Error ? error.message : TRY_AGAIN }
  }
}

// Boosts one of the viewer's own posts. The post becomes a campaign with the post's own words as its ad. A person reviews it
// before it runs, and it is paid from the advertising balance as people see it. Only a top-level text post, and only once.
export type BoostResult = { ok: true; campaignId: string } | { ok: false; error: string; needsAccount?: boolean }

// What the boost sheet shows for one post: the ad as it will look, the budgets, and the balance. Only the author gets anything.
export async function boostSetup(postId: string): Promise<BoostSetup> {
  const viewer = await requireAgreedViewer()
  if (typeof postId !== "string" || !/^[0-9a-f-]{36}$/.test(postId)) return { kind: "missing" }
  return boostSetupFor(viewer.id, postId)
}

export async function boostPost(postId: string, dollars: number): Promise<BoostResult> {
  const viewer = await requireAgreedViewer()
  if (typeof postId !== "string" || !/^[0-9a-f-]{36}$/.test(postId)) return { ok: false, error: "That post is not available." }
  if (!(BOOST_BUDGETS as readonly number[]).includes(dollars)) return { ok: false, error: "Choose one of the amounts." }
  const account = await get<{ id: string; status: string }>("SELECT id, status FROM ad_accounts WHERE user_id = ?", viewer.id)
  if (!account) return { ok: false, error: "Set up advertising first. A boost is an ad.", needsAccount: true }
  if (account.status !== "active") return { ok: false, error: "Your advertising account is not active." }
  const publicUrl = (process.env.RHENKO_PUBLIC_URL ?? "").replace(/\/+$/, "")
  if (!publicUrl) return { ok: false, error: "Boosts are not set up on this server yet." }
  const post = await get<{ body: string; handle: string; has_extra: number }>(
    `SELECT p.body, u.handle,
       CASE WHEN p.media_file IS NOT NULL OR EXISTS (SELECT 1 FROM post_media m WHERE m.post_id = p.id)
         OR EXISTS (SELECT 1 FROM polls pl WHERE pl.post_id = p.id) THEN 1 ELSE 0 END AS has_extra
     FROM posts p JOIN users u ON u.id = p.author_id
     WHERE p.id = ? AND p.author_id = ? AND p.reply_to_id IS NULL AND p.is_draft = 0 AND p.publish_at IS NULL AND p.removed_at IS NULL`,
    postId,
    viewer.id
  )
  if (!post) return { ok: false, error: "That post is not available." }
  if (post.has_extra === 1) return { ok: false, error: "Only text posts can be boosted for now." }
  const made = boostCopy({ text: post.body, handle: post.handle, postId }, publicUrl)
  if ("problem" in made) return { ok: false, error: made.problem }
  if (await get("SELECT 1 AS found FROM ad_campaigns WHERE post_id = ? AND status IN ('in_review', 'active', 'paused')", postId)) {
    return { ok: false, error: "This post is already boosted." }
  }
  const waiting = await get<{ n: number }>("SELECT COUNT(*) AS n FROM ad_campaigns WHERE account_id = ? AND status = 'in_review'", account.id)
  if ((waiting?.n ?? 0) >= AD_CAMPAIGNS_WAITING_MAX) {
    return { ok: false, error: `You can have ${AD_CAMPAIGNS_WAITING_MAX} campaigns waiting for review. Wait for one to be reviewed.` }
  }
  const campaignId = newId()
  await run(
    `INSERT INTO ad_campaigns (id, account_id, headline, body, cta, link_url, picture_file, topic, budget_micro, spent_micro, impressions, clicks, status, review_note, reviewed_at, created_at, post_id)
     VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, 0, 0, 0, 'in_review', NULL, NULL, ?, ?)`,
    campaignId,
    account.id,
    made.copy.headline,
    made.copy.body,
    made.copy.cta,
    made.copy.link,
    dollars * 100 * MICRO_PER_CENT,
    Date.now(),
    postId
  )
  revalidatePath("/advertise")
  return { ok: true, campaignId }
}
