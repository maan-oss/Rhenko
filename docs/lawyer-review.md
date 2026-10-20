# Lawyer review packet

This is what a lawyer needs to review the legal text of Rhenko, what the operator must supply first, and the payment
decisions that stay with the operator. The step-by-step launch checklist is in [legal-operations.md](legal-operations.md).

## Status

- The legal pages are drafts. They carry the draft banner, and the banner stays until a lawyer has reviewed them.
- `RHENKO_LEGAL_REVIEWED` is not set and must not be set until the review is done.
- Nothing in the legal text was filled from a guess. Where a value is missing, the page says it has not been published.

## Pages in scope

| Page | Path | What it covers |
| --- | --- | --- |
| Terms of Service | `app/terms/page.tsx` | Accounts, content, subscriptions and tips, cancellation and withdrawal, termination |
| Privacy Policy | `app/privacy/page.tsx` | What is collected, why, who receives it, retention periods, rights, the India grievance route |
| Rules | `app/rules/page.tsx` | What people may post, and what happens when a rule is broken |
| Safety | `app/safety/page.tsx` | Reporting, the notice route for intimate images and other harms, and emergency wording |
| Notice and counter-notice | `app/notice/page.tsx`, `app/copyright/page.tsx` | How to report unlawful content, the copyright notice route, and the counter-notice |
| Transparency | `app/transparency/page.tsx` | How ranking, connection suggestions, moderation and appeals work, in plain words |
| Advertising transparency | `app/transparency/ads/page.tsx` | How ads are labelled, how spend is charged, and balance handling |
| Legal index | `app/legal/page.tsx` | Links to every page above |

The shared operator block that the pages read is `app/_legal/operator.tsx`. Its values come from the `RHENKO_*`
variables in `.env.example`.

## Changes to the legal text since the last review

- **Privacy Policy, Cookies:** one new line for `rhenko-feed`, a one-year cookie that remembers whether Home opens on For
  you or Following. It sits next to `rhenko-sidebar`, which is already listed. The policy says Rhenko sets only the
  cookies it needs, so the lawyer should confirm that a preference cookie fits that sentence.
- **Transparency:** two new figures, the average time to decide an appeal and the oldest appeal still waiting. They are
  computed from the server's own records, and the page says they are not an audited report.

## Values the operator must supply

These are read from the environment. A missing value shows "not yet published" on the page. It does not stop the app.

| Variable | Used on | Status |
| --- | --- | --- |
| `RHENKO_OPERATOR_NAME` | Terms, Privacy, Copyright | **Operator must supply.** The legal name of the entity that runs the server. |
| `RHENKO_OPERATOR_ADDRESS` | Terms, Privacy, Copyright | **Operator must supply.** A postal address. |
| `RHENKO_CONTACT_EMAIL` | Terms | **Operator must supply.** A business address, not a personal one. |
| `RHENKO_PRIVACY_EMAIL` | Privacy | **Operator must supply.** Used for data requests. |
| `RHENKO_GRIEVANCE_OFFICER` | Privacy (India) | **Operator must supply.** Required under the IT Rules and the DPDP Act. |
| `RHENKO_GRIEVANCE_EMAIL` | Privacy (India) | **Operator must supply.** |
| `RHENKO_COPYRIGHT_AGENT_NAME` | Copyright | **Operator must supply.** The agent registered with the US Copyright Office. |
| `RHENKO_COPYRIGHT_AGENT_EMAIL` | Copyright | **Operator must supply.** |
| `RHENKO_COPYRIGHT_AGENT_ADDRESS` | Copyright | **Operator must supply.** |
| `RHENKO_EU_REPRESENTATIVE` | Privacy, Terms | Needed only if the operator is not established in the EU and offers the service there. Lawyer to confirm. |
| `RHENKO_UK_REPRESENTATIVE` | Privacy, Terms | Needed only if the operator is not established in the UK and offers the service there. Lawyer to confirm. |
| `RHENKO_HOSTING_LOCATION` | Terms, Privacy | **Proposed: India.** The operator has said the server should be hosted in India. The exact city is not recorded and must be confirmed. |
| `RHENKO_GOVERNING_LAW` | Terms | **Lawyer and operator decide.** Not recorded anywhere. |

Do not use a personal or outreach email address as any of these contacts. The policy pages publish them.

## Open legal questions for the lawyer

These are gaps the app does not cover yet, from `docs/legal-operations.md` section 6.

1. **Counter-notice statement.** The copyright notice form does not take a statement under penalty of perjury. The
   appeal form takes only a reason of at least 10 characters. Decide whether both must be added.
2. **Counter-notice timing.** The point at which a post goes back after a counter-notice is set by hand. The app does
   not track it. Decide the period and whether the app should track it.
3. **Geographic restriction.** A post removed under one country's order is removed everywhere on this server. Decide
   whether that is acceptable or whether restriction by country is needed.
4. **Intimate-image removal deadlines.** The app does not track them. Decide the deadline the policy states.
5. **Request log.** The app keeps no request log, only the proxy in front of it does. Confirm that the Privacy Policy
   describes this correctly.
6. **Age.** Age assurance is the date of birth only. Confirm this is what the Terms should say.

## Payment decisions for the operator

These are not changed by the app. The operator decides each one, and the lawyer checks the wording. Each item names the
text it affects and a recommendation.

1. **Payment records on account deletion.** Deleting an account removes its rows in the app's payment tables by cascade:
   subscriptions, the Stripe customer link, tips it sent or received, the advertising account, its campaigns and its
   advertising ledger (`db/postgres/schema.sql`). Stripe keeps its own records under its own policy. The Privacy Policy
   does not say which financial records are kept, for tax or legal reasons, after deletion, or for how long.
   - Option A: keep the minimum financial records the law requires (for example a ledger of payments and refunds, with
     the personal fields removed) for the period the lawyer sets, and delete the rest.
   - Option B: delete everything the app holds on deletion, and rely on Stripe's own retention.
   - **Recommendation: Option A**, with the period set by the lawyer. Option B leaves the operator with no record of its
     own payments if a dispute or tax audit comes up later.
   - This interacts with item 4: if the advertising ledger is deleted with the account, an unspent balance cannot be
     refunded afterwards.

2. **Withdrawal right for subscriptions.** The Terms let people withdraw from a subscription, and say that cancelling
   does not refund the period already paid except under the withdrawal right. Consumers in the EU and UK usually have a
   cooling-off right, and it can be lost once digital content is delivered straight away.
   - **Recommendation:** keep the right, and have the lawyer confirm the wording for each market the operator serves.

3. **Price changes.** The Terms say a subscription renews at the price shown until cancelled. They do not yet set how
   much notice a price change needs.
   - **Recommendation:** give notice before a new price applies, for the period the lawyer sets, and let people cancel
     before it takes effect.

4. **Advertising balance refunds.** The advertising transparency page says unspent balance can be requested back through
   the contact address. That address is not published until the operator supplies it, so the sentence cannot be acted on
   yet.
   - **Recommendation:** name a refund process and an owner, publish the address, and have the lawyer confirm the
     refund period.

## Verification

- `npx tsc --noEmit`, eslint on the changed files, `npm run test:unit` (121 passing) and `npm run build` all pass.
- Three runs were needed, and each failure came from the local environment, not the code:
  1. With the Postgres cluster down, the passkey and direct-message checks failed.
  2. With Postgres back up but the mail sink not listening, 227 of 232 checks passed. The five that failed were the
     account email-code checks and three legal notice checks, all of which send mail.
  3. With the mail sink running, the account and legal areas were rerun: 72 of 72 passed.
- A phone-sized browser check confirmed the bottom bar is hidden on a chat and on the new-message page, returns on home,
  and that a sent message appears at once. Calls were not checked visually.
