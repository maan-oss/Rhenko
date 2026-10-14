import Stripe from "stripe"
import { newId, runChanges, type Viewer } from "@/lib/auth"
import { all, get, run, transaction } from "@/lib/db"
import { visiblePostIds } from "@/lib/data"
import { formatMoney } from "@/lib/money"
import { ADD_CREDIT_OPTIONS, MICRO_PER_CENT } from "@/lib/ad-rules"

// Payments through Stripe: subscriptions (Plus and paid verification), tips to creators, creators' payout accounts,
// advertising credit, and the refund for a subscription cancelled in its first fourteen days.
// Nothing here stores a card number. Stripe holds the card, and this file keeps only Stripe's identifiers and the
// amounts it reports.

export type Kind = "plus" | "verified"
const WITHDRAW_DAYS = 14
const TIP_FEE_LIMIT = 50
const PRICE_TTL_MS = 60 * 60 * 1000

// ── Configuration ───────────────────────────────────────────────────────────────────────────────────────────────────

export const CURRENCY = (process.env.RHENKO_CURRENCY ?? "usd").toLowerCase()

// Tip amounts in whole currency units, from RHENKO_TIP_AMOUNTS (for example "3,5,10"). Stored and charged in minor units.
export function tipAmounts(): number[] {
  const parsed = (process.env.RHENKO_TIP_AMOUNTS ?? "3,5,10")
    .split(",")
    .map((part) => Math.round(Number(part.trim()) * 100))
    .filter((amount) => Number.isInteger(amount) && amount >= 50 && amount <= 100_000)
  return parsed.length > 0 ? [...new Set(parsed)].sort((a, b) => a - b) : [300, 500, 1000]
}

// The platform's share of a tip, in percent. Disclosed in the terms.
export function tipFeePercent(): number {
  const value = Number(process.env.RHENKO_TIP_FEE_PERCENT ?? 10)
  return Number.isFinite(value) ? Math.min(Math.max(value, 0), TIP_FEE_LIMIT) : 10
}

// The country a creator's payout account is opened in. Stripe requires one when the account is made.
export function payoutCountry(): string {
  return (process.env.RHENKO_PAYOUT_COUNTRY ?? "AU").toUpperCase()
}

export function paymentsConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.RHENKO_PUBLIC_URL)
}

export function priceIdFor(kind: Kind): string | null {
  const id = kind === "plus" ? process.env.RHENKO_STRIPE_PRICE_PLUS : process.env.RHENKO_STRIPE_PRICE_VERIFIED
  return id && id.startsWith("price_") ? id : null
}

function taxEnabled(): boolean {
  return process.env.RHENKO_STRIPE_TAX === "1"
}

// The site's own address. Stripe sends people back here, so it comes from configuration, never from a request header.
export function publicOrigin(): string {
  return (process.env.RHENKO_PUBLIC_URL ?? "").replace(/\/+$/, "")
}

// Set in an unusual deployment (tests, or a regional gateway). Not needed for live payments.
function apiOptions(): Stripe.StripeConfig {
  const base = process.env.RHENKO_STRIPE_API_URL
  if (!base) return {}
  const url = new URL(base)
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : undefined,
    protocol: url.protocol === "http:" ? "http" : "https",
  }
}

let client: Stripe | null = null

export function stripe(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) throw new Error("Payments are not set up on this server.")
    client = new Stripe(key, apiOptions())
  }
  return client
}

// ── Prices shown to people come from Stripe, so the page never shows a different amount from the one charged ─────────

const prices = new Map<string, { label: string; at: number }>()

export async function priceLabel(priceId: string): Promise<string | null> {
  const known = prices.get(priceId)
  if (known && Date.now() - known.at < PRICE_TTL_MS) return known.label
  try {
    const price = await stripe().prices.retrieve(priceId)
    if (price.unit_amount === null) return null
    const interval = price.recurring?.interval === "year" ? "year" : "month"
    const label = `${formatMoney(price.unit_amount, price.currency)} a ${interval}`
    prices.set(priceId, { label, at: Date.now() })
    return label
  } catch {
    return null
  }
}

// ── Subscriptions ───────────────────────────────────────────────────────────────────────────────────────────────────

type SubscriptionRow = { id: string; kind: Kind; status: string; cancel_at_period_end: number; current_period_end: number | null; created_at: number }

export function activeSubscription(userId: string, kind: Kind): SubscriptionRow | undefined {
  return get<SubscriptionRow>(
    "SELECT id, kind, status, cancel_at_period_end, current_period_end, created_at FROM subscriptions WHERE user_id = ? AND kind = ? AND status IN ('active', 'trialing') ORDER BY created_at DESC LIMIT 1",
    userId,
    kind
  )
}

function subscriptionKind(subscription: Stripe.Subscription): Kind | null {
  const fromMetadata = subscription.metadata?.kind
  if (fromMetadata === "plus" || fromMetadata === "verified") return fromMetadata
  const price = subscription.items?.data?.[0]?.price?.id
  if (price && price === process.env.RHENKO_STRIPE_PRICE_PLUS) return "plus"
  if (price && price === process.env.RHENKO_STRIPE_PRICE_VERIFIED) return "verified"
  return null
}

function periodEndOf(subscription: Stripe.Subscription): number | null {
  const legacy = (subscription as unknown as { current_period_end?: number }).current_period_end
  const item = subscription.items?.data?.[0] as unknown as { current_period_end?: number } | undefined
  const seconds = legacy ?? item?.current_period_end ?? null
  return seconds ? seconds * 1000 : null
}

function idOf(customer: string | { id: string } | null | undefined): string | null {
  if (!customer) return null
  return typeof customer === "string" ? customer : customer.id
}

// Writes what Stripe says about a subscription. The badge for paid verification is recomputed from the rows.
// A webhook can arrive after the account it belongs to has been deleted. Those events are skipped rather than failing and being
// sent again by Stripe for days.
function userExists(userId: string): boolean {
  return Boolean(get("SELECT 1 AS found FROM users WHERE id = ?", userId))
}

function saveSubscription(subscription: Stripe.Subscription): void {
  const kind = subscriptionKind(subscription)
  const customer = idOf(subscription.customer)
  const userId =
    subscription.metadata?.user_id || (customer ? get<{ user_id: string }>("SELECT user_id FROM stripe_customers WHERE customer_id = ?", customer)?.user_id : undefined)
  if (!kind || !userId || !userExists(userId)) return
  if (customer) {
    run("INSERT INTO stripe_customers (user_id, customer_id, created_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO NOTHING", userId, customer, Date.now())
  }
  const now = Date.now()
  run(
    `INSERT INTO subscriptions (id, user_id, kind, status, cancel_at_period_end, current_period_end, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET status = excluded.status, cancel_at_period_end = excluded.cancel_at_period_end,
       current_period_end = excluded.current_period_end, updated_at = excluded.updated_at`,
    subscription.id,
    userId,
    kind,
    subscription.status,
    subscription.cancel_at_period_end ? 1 : 0,
    periodEndOf(subscription),
    subscription.created ? subscription.created * 1000 : now,
    now
  )
  syncPaidVerified(userId)
}

// The paid badge is on while the person has an active paid verification subscription, and off the moment it lapses.
export function syncPaidVerified(userId: string): void {
  run(
    `UPDATE users SET paid_verified = CASE WHEN EXISTS(
       SELECT 1 FROM subscriptions WHERE user_id = ? AND kind = 'verified' AND status IN ('active', 'trialing')
     ) THEN 1 ELSE 0 END WHERE id = ?`,
    userId,
    userId
  )
}

// Ends every paid subscription at the end of the period already paid for. Used when an account is deactivated, so no
// one is charged for an account that is hidden.
export async function endSubscriptionsAtPeriodEnd(userId: string): Promise<void> {
  if (!paymentsConfigured()) return
  const rows = all<{ id: string }>("SELECT id FROM subscriptions WHERE user_id = ? AND status IN ('active', 'trialing') AND cancel_at_period_end = 0", userId)
  for (const row of rows) {
    const updated = await stripe().subscriptions.update(row.id, { cancel_at_period_end: true })
    saveSubscription(updated)
  }
}

// The subscription checkout. The person pays Stripe's page, and the webhook records the result.
export async function subscriptionCheckoutUrl(viewer: Viewer, kind: Kind): Promise<string> {
  const price = priceIdFor(kind)
  if (!price) throw new Error("This subscription is not set up yet.")
  if (kind === "verified" && !viewer.emailVerified) {
    throw new Error("Confirm your email address first. Paid verification needs one.")
  }
  if (activeSubscription(viewer.id, kind)) throw new Error("You already have this subscription.")
  const customer = get<{ customer_id: string }>("SELECT customer_id FROM stripe_customers WHERE user_id = ?", viewer.id)
  const origin = publicOrigin()
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price, quantity: 1 }],
    client_reference_id: viewer.id,
    ...(customer ? { customer: customer.customer_id } : viewer.email ? { customer_email: viewer.email } : {}),
    subscription_data: { metadata: { user_id: viewer.id, kind } },
    metadata: { user_id: viewer.id, kind },
    automatic_tax: { enabled: taxEnabled() },
    success_url: `${origin}/settings/billing?checkout=done`,
    cancel_url: `${origin}/settings/billing?checkout=cancelled`,
  })
  if (!session.url) throw new Error("Stripe did not return a payment page. Try again.")
  return session.url
}

// The customer portal: change a card, see invoices, or cancel. Stripe runs it, so the app never sees card details.
export async function billingPortalUrl(viewer: Viewer): Promise<string> {
  const customer = get<{ customer_id: string }>("SELECT customer_id FROM stripe_customers WHERE user_id = ?", viewer.id)
  if (!customer) throw new Error("You have no subscription to manage yet.")
  const session = await stripe().billingPortal.sessions.create({ customer: customer.customer_id, return_url: `${publicOrigin()}/settings/billing` })
  return session.url
}

// Withdrawal: a subscription cancelled within fourteen days of starting ends at once and its first payment is refunded.
export async function withdrawFromSubscription(viewer: Viewer, kind: Kind): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = activeSubscription(viewer.id, kind)
  if (!row) return { ok: false, error: "There is no active subscription to withdraw from." }
  if (Date.now() - row.created_at > WITHDRAW_DAYS * 24 * 60 * 60 * 1000) {
    return { ok: false, error: `You can withdraw within ${WITHDRAW_DAYS} days of starting. After that, cancel and the subscription ends at the end of the period you paid for.` }
  }
  const cancelled = await stripe().subscriptions.cancel(row.id)
  saveSubscription(cancelled)
  const invoices = await stripe().invoices.list({ subscription: row.id, limit: 1 })
  const invoice = invoices.data[0] as (Stripe.Invoice & { payment_intent?: string | { id: string } | null }) | undefined
  const intent = invoice ? idOf(invoice.payment_intent as string | { id: string } | null | undefined) : null
  if (invoice && invoice.status === "paid" && invoice.amount_paid > 0 && intent) {
    await stripe().refunds.create({ payment_intent: intent })
  }
  return { ok: true }
}

// ── Tips ────────────────────────────────────────────────────────────────────────────────────────────────────────────

// A checkout for a tip. The creator's payout account receives the amount less the platform's share.
export async function tipCheckoutUrl(viewer: Viewer, postId: string, amount: number): Promise<string> {
  if (!tipAmounts().includes(amount)) throw new Error("That tip amount is not on offer.")
  const post = get<{ author_id: string; handle: string }>(
    "SELECT p.author_id, u.handle FROM posts p JOIN users u ON u.id = p.author_id WHERE p.id = ? AND p.removed_at IS NULL AND p.is_draft = 0 AND p.publish_at IS NULL",
    postId
  )
  if (!post || visiblePostIds([postId], viewer.id).size === 0) throw new Error("That post is not available.")
  if (post.author_id === viewer.id) throw new Error("You cannot tip yourself.")
  const account = get<{ account_id: string; charges_enabled: number }>("SELECT account_id, charges_enabled FROM connect_accounts WHERE user_id = ?", post.author_id)
  if (!account || account.charges_enabled !== 1) throw new Error("This person has not set up tips yet.")
  const fee = Math.round((amount * tipFeePercent()) / 100)
  const origin = publicOrigin()
  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    line_items: [{ quantity: 1, price_data: { currency: CURRENCY, unit_amount: amount, product_data: { name: `Tip for @${post.handle}` } } }],
    payment_intent_data: { application_fee_amount: fee, transfer_data: { destination: account.account_id } },
    client_reference_id: viewer.id,
    metadata: { kind: "tip", from_user_id: viewer.id, to_user_id: post.author_id, post_id: postId, fee: String(fee) },
    success_url: `${origin}/${post.handle}/status/${postId}?tip=thanks`,
    cancel_url: `${origin}/${post.handle}/status/${postId}`,
  })
  if (!session.url) throw new Error("Stripe did not return a payment page. Try again.")
  return session.url
}

// ── Creator payouts (Stripe Connect Express) ────────────────────────────────────────────────────────────────────────

export async function payoutOnboardingUrl(viewer: Viewer): Promise<string> {
  let account = get<{ account_id: string }>("SELECT account_id FROM connect_accounts WHERE user_id = ?", viewer.id)
  if (!account) {
    const created = await stripe().accounts.create({
      type: "express",
      country: payoutCountry(),
      email: viewer.email ?? undefined,
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      metadata: { user_id: viewer.id },
    })
    run(
      "INSERT INTO connect_accounts (user_id, account_id, charges_enabled, payouts_enabled, updated_at) VALUES (?, ?, 0, 0, ?)",
      viewer.id,
      created.id,
      Date.now()
    )
    account = { account_id: created.id }
  }
  const origin = publicOrigin()
  const link = await stripe().accountLinks.create({
    account: account.account_id,
    type: "account_onboarding",
    refresh_url: `${origin}/settings/billing?payouts=refresh`,
    return_url: `${origin}/settings/billing?payouts=return`,
  })
  return link.url
}

// ── Advertising credit (the ad balance is in micro-units: one cent is 10,000) ───────────────────────────────────────

// Adds the paid amount to the balance once: a repeated record for the same checkout is ignored. Runs inside the
// webhook's transaction (processStripeEvent), so it does not open one of its own.
function creditAdAccount(accountId: string, amount: number, reference: string): void {
  const account = get<{ id: string }>("SELECT id FROM ad_accounts WHERE id = ?", accountId)
  if (!account) {
    // Stripe has already taken the payment. Log it so the operator can refund it.
    console.error("advertising credit paid for an account that no longer exists", reference)
    return
  }
  const added = runChanges(
    "INSERT OR IGNORE INTO ad_ledger (id, account_id, kind, amount_micro, reference, created_at) VALUES (?, ?, 'credit', ?, ?, ?)",
    newId(),
    accountId,
    amount * MICRO_PER_CENT,
    reference,
    Date.now()
  )
  if (added > 0) run("UPDATE ad_accounts SET balance_micro = balance_micro + ? WHERE id = ?", amount * MICRO_PER_CENT, accountId)
}

export async function adCreditUrl(viewer: Viewer, accountId: string, amount: number): Promise<string> {
  if (!ADD_CREDIT_OPTIONS.includes(amount)) throw new Error("That amount is not on offer.")
  const account = get<{ id: string; currency: string }>("SELECT id, currency FROM ad_accounts WHERE id = ? AND user_id = ?", accountId, viewer.id)
  if (!account) throw new Error("Set up an advertising account first.")
  const origin = publicOrigin()
  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    line_items: [{ quantity: 1, price_data: { currency: account.currency, unit_amount: amount, product_data: { name: "Advertising credit" } } }],
    client_reference_id: viewer.id,
    metadata: { kind: "ad_credit", ad_account_id: accountId, user_id: viewer.id },
    success_url: `${origin}/advertise?credit=added`,
    cancel_url: `${origin}/advertise`,
  })
  if (!session.url) throw new Error("Stripe did not return a payment page. Try again.")
  return session.url
}

// ── Webhooks ────────────────────────────────────────────────────────────────────────────────────────────────────────

// Checks the signature of a webhook and returns the event. A request that fails the check is not trusted.
export function webhookEvent(payload: string, signature: string): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) throw new Error("Payments are not set up on this server.")
  return stripe().webhooks.constructEvent(payload, signature, secret)
}

// Applies one event once. Stripe can send an event again, so each one is recorded and a repeat changes nothing.
export function processStripeEvent(event: Stripe.Event): void {
  if (get<{ id: string }>("SELECT id FROM stripe_events WHERE id = ?", event.id)) return
  transaction(() => {
    apply(event)
    run("INSERT INTO stripe_events (id, received_at) VALUES (?, ?)", event.id, Date.now())
  })
}

function apply(event: Stripe.Event): void {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session
      if (session.mode === "subscription") {
        const userId = session.client_reference_id ?? session.metadata?.user_id
        const customer = idOf(session.customer)
        if (userId && customer && userExists(userId)) {
          run("INSERT INTO stripe_customers (user_id, customer_id, created_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO NOTHING", userId, customer, Date.now())
        }
      } else if (session.mode === "payment" && session.metadata?.kind === "tip") {
        const tipper = session.client_reference_id ?? session.metadata.from_user_id
        const creator = session.metadata.to_user_id
        if (!tipper || !creator) return
        if (!userExists(tipper) || !userExists(creator)) {
          // Stripe has already moved the money. Log it so the operator can refund it.
          console.error("tip paid for an account that no longer exists, not recorded", session.id)
          return
        }
        run(
          `INSERT INTO tips (id, post_id, from_user_id, to_user_id, amount, fee, currency, payment_intent, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'paid', ?) ON CONFLICT(id) DO NOTHING`,
          session.id,
          session.metadata.post_id || null,
          tipper,
          creator,
          session.amount_total ?? 0,
          Number(session.metadata.fee ?? 0),
          session.currency ?? CURRENCY,
          idOf(session.payment_intent as string | { id: string } | null),
          Date.now()
        )
      } else if (session.mode === "payment" && session.metadata?.kind === "ad_credit") {
        const accountId = session.metadata.ad_account_id
        if (accountId && session.amount_total) creditAdAccount(accountId, session.amount_total, session.id)
      }
      return
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      saveSubscription(event.data.object as Stripe.Subscription)
      return
    case "account.updated": {
      const account = event.data.object as Stripe.Account
      run(
        "UPDATE connect_accounts SET charges_enabled = ?, payouts_enabled = ?, updated_at = ? WHERE account_id = ?",
        account.charges_enabled ? 1 : 0,
        account.payouts_enabled ? 1 : 0,
        Date.now(),
        account.id
      )
      return
    }
    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge
      const intent = idOf(charge.payment_intent as string | { id: string } | null)
      if (intent) run("UPDATE tips SET status = 'refunded' WHERE payment_intent = ?", intent)
      return
    }
    default:
      return
  }
}

// ── What the billing page shows ────────────────────────────────────────────────────────────────────────────────────

export type BillingState = {
  configured: boolean
  emailVerified: boolean
  plus: { active: boolean; cancelAtPeriodEnd: boolean; periodEnd: number | null; withdrawable: boolean }
  verified: { active: boolean; cancelAtPeriodEnd: boolean; periodEnd: number | null }
  tips: { count: number; total: number; currency: string }
  payouts: { started: boolean; ready: boolean }
}

export function billingState(viewer: Viewer): BillingState {
  const plus = activeSubscription(viewer.id, "plus")
  const verified = activeSubscription(viewer.id, "verified")
  const tips = get<{ count: number; total: number | null }>(
    "SELECT COUNT(*) AS count, SUM(amount - fee) AS total FROM tips WHERE to_user_id = ? AND status = 'paid'",
    viewer.id
  )
  const account = get<{ charges_enabled: number }>("SELECT charges_enabled FROM connect_accounts WHERE user_id = ?", viewer.id)
  return {
    configured: paymentsConfigured(),
    emailVerified: viewer.emailVerified,
    plus: {
      active: Boolean(plus),
      cancelAtPeriodEnd: plus?.cancel_at_period_end === 1,
      periodEnd: plus?.current_period_end ?? null,
      withdrawable: Boolean(plus && Date.now() - plus.created_at <= WITHDRAW_DAYS * 24 * 60 * 60 * 1000),
    },
    verified: { active: Boolean(verified), cancelAtPeriodEnd: verified?.cancel_at_period_end === 1, periodEnd: verified?.current_period_end ?? null },
    tips: { count: tips?.count ?? 0, total: tips?.total ?? 0, currency: CURRENCY },
    payouts: { started: Boolean(account), ready: account?.charges_enabled === 1 },
  }
}
