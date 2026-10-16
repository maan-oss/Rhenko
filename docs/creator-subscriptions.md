# Creator subscriptions: feasibility

A viewer pays a monthly amount to one creator, and gets that creator's subscriber-only posts. This note says what that
takes on top of what Rhenko already has, what is hard, and what to decide first. It is a plan, not a build.

## What already exists

- **Plus and Verified subscriptions** are Stripe Checkout subscriptions. `lib/payments.ts` creates the session
  (`subscriptionCheckoutUrl`), `processStripeEvent` writes the `subscriptions` table from webhooks, and
  `activeSubscription` answers "is this viewer paying for this kind". The table only allows `plus` and `verified`.
- **Tips** already move money to a creator. `tipCheckoutUrl` makes a one-off Checkout with a destination charge to the
  creator's Connect account and an `application_fee_amount` (the platform fee, `RHENKO_TIP_FEE_PERCENT`, default 10%,
  capped at 50%). Paid tips land in `tips`.
- **Creator payouts** run through Stripe Connect Express onboarding (`payoutOnboardingUrl`), with `connect_accounts`
  holding `charges_enabled` and `payouts_enabled`. Payouts are limited to the countries `payoutCountry()` allows.
- **Post bells** (`post_subscriptions`) are notifications only. They are free and have no paywall. The name is taken,
  so a paid table should be called something else, such as `creator_subscriptions`.

## What it would take

1. **Money in.** Add a `creator` kind to the Checkout flow in `subscriptionCheckoutUrl`. The subscription is created
   with `subscription_data.transfer_data.destination` set to the creator's Connect account and an
   `application_fee_percent`, the same pattern tips use. A price can be inline (`price_data` with a recurring interval),
   so no Stripe Product has to exist per creator. The webhook already records the subscription; it needs the creator
   in metadata and a new table row keyed on (viewer, creator).
2. **Access.** A creator-only audience must be checked wherever a post is shown: `visibilityClause` in `lib/data.ts`,
   feeds, search, post pages, and media URLs. Replies and quotes of a locked post also need a rule. This is the largest
   piece and the easiest place to leak content, so it needs tests on every surface.
3. **Caches.** The feed ranking cache is per viewer (`forgetRanking`). When a subscription starts or ends, the viewer's
   cache must be cleared, and so must any cached public page that shows a locked post without its lock.
4. **Ending.** Cancel at period end, refunds and disputes must each remove access at the right time. Stripe sends
   `customer.subscription.deleted` and `charge.dispute.created`; both need handlers.
5. **Terms and tax.** Recurring payments need the Terms of Service to say what is paid, what the platform keeps, and how
   cancellation works. Stripe Tax (or a merchant-of-record provider) is needed for VAT and sales tax on digital
   subscriptions. This is a legal decision, not only an engineering one.
6. **Analytics.** Subscriber counts and monthly revenue, shown the same way as tips in the Connect page.

## Estimate

Roughly three to five weeks for one engineer: about one week for checkout and webhooks, two for access rules across
every surface with tests, one for cancellation, refunds and disputes, and the rest for the creator and viewer screens
and the terms work.

## Decisions needed first

- Is there one price per creator, or a fixed tier set by the platform? A fixed tier is far simpler to support.
- Does the platform take the same fee as tips (10% by default), or a different one for subscriptions?
- Which countries are in scope? It can be no wider than Connect payouts.
- Who may charge: any account with charges enabled, or only verified accounts?
- Should an existing post become locked after the fact, or only posts written after a creator turns subscriptions on?
  The second is far safer and should be the default.

## Recommendation

Build it after the Priority and starter pack work is in use, and only once the decisions above are made. The payment
path is already proven by tips, so the risk is in the access rules and the legal terms, not in Stripe.
