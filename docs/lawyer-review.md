# Lawyer review packet

This is what a lawyer needs to review the legal text of Rhenko: what the operator must supply first, the decisions the operator has
made (with the reasons), the payment decisions, and what is still open. The step-by-step launch checklist is in
[legal-operations.md](legal-operations.md).

## Status (7 November 2026)

- The legal pages are drafts. Each carries a draft notice, shown until `RHENKO_LEGAL_REVIEWED=1` is set (`app/_legal/shell.tsx`).
- `RHENKO_LEGAL_REVIEWED` is not set and must not be set until a lawyer's review is on record. The operator has said the text was
  reviewed; no review record or list of changes has reached the repository, so this packet still treats it as unreviewed.
- The operator has made the decisions below, so counsel can confirm or change them. Each is marked **Decided** and says what the app
  and the pages do now.
- Where a value is missing, the page says it has not been published. Nothing was filled from a guess.

## Pages in scope

| Page | Path | What it covers |
| --- | --- | --- |
| Terms of Service | `app/(marketing)/terms/page.tsx` | Accounts, content, subscriptions and tips, cancellation and withdrawal, ending use |
| Privacy Policy | `app/(marketing)/privacy/page.tsx` | What is collected, why, who receives it, how long it is kept, rights, the India grievance route |
| Rules | `app/(marketing)/rules/page.tsx` | What people may post, and what happens when a rule is broken |
| Safety | `app/(marketing)/safety/page.tsx` | Reporting, the route for intimate images and other harms, emergency wording |
| Notice | `app/(marketing)/notice/page.tsx` | How to report unlawful content |
| Copyright | `app/(marketing)/copyright/page.tsx` | The copyright notice, the counter-notice, repeat infringers |
| Transparency | `app/(marketing)/transparency/page.tsx` | Moderation and appeals figures for this server |
| Advertising transparency | `app/(marketing)/transparency/ads/page.tsx` | Advertising policy, how ads are paid for, and the ad library |
| Legal index | `app/(marketing)/legal/page.tsx` | Links to every page above |

The operator details the pages read come from `app/_legal/operator.tsx`, which reads the `RHENKO_*` variables listed in `.env.example`.

## Changes to the legal text on 7 November 2026

- **Terms version** is now `2026-11-07-1`. Every account must accept it again before it can use the app.
- **Terms, Geographic:** a post removed because of an order from one country is removed for everyone. Rhenko does not restrict content
  by country.
- **Terms, Price changes:** at least 30 days' notice before a new subscription price applies, and the right to cancel before it does.
- **Terms, Ending use:** deleting an account keeps payment records without the account's name (see payment decision 1).
- **Copyright, Repeat infringers:** three upheld copyright notices against an account within 12 months lead to a review. The account is
  closed if the review finds repeated infringement.
- **Privacy, Messages:** what the encrypted chat does not do yet: no video, no link previews, no translation, and a notification says
  "Encrypted message" rather than the text.
- **Privacy, Cookies:** one line for `rhenko-feed`, a one-year cookie that remembers whether Home opens on For you or Following. Counsel
  should confirm that a preference cookie fits the sentence saying Rhenko sets only the cookies it needs.
- **Transparency:** two new figures, the average time to decide an appeal and the oldest appeal still waiting, computed from the
  server's own records. The page says they are not an audited report.
- **Advertising transparency:** a confirmed request for unspent balance is paid back to the card within 14 days.
- **Intimate-image deadline** is 24 hours (decision 5 below).

## Values the operator must supply

These are read from the environment. A missing value shows "not yet published" on the page. It does not stop the app.

| Variable | Used on | Status |
| --- | --- | --- |
| `RHENKO_OPERATOR_NAME` | Terms, Privacy, Copyright | **Set to `Maan Ghori`** in the local `.env`. The operator is an individual; there is no company. Confirm the spelling. |
| `RHENKO_OPERATOR_ADDRESS` | Terms, Privacy, Copyright | **Set to `47 Prominence Street, Pallara, Brisbane QLD 4110, Australia`.** Confirm the street spelling and the postcode. |
| `RHENKO_CONTACT_EMAIL` | Terms | **Still needed.** Currently `info.rhenko@gmail.com`, a personal mail account. Replace it with a business address on a domain the operator controls. |
| `RHENKO_PRIVACY_EMAIL` | Privacy | **Still needed.** Same as above. Used for data requests. |
| `RHENKO_GRIEVANCE_OFFICER` | Privacy (India) | **Set to `Mahesh Ghori`.** India's IT Rules 2021 require a grievance officer. |
| `RHENKO_GRIEVANCE_EMAIL` | Privacy (India) | **Still needed.** Must be read by the grievance officer. Currently `info.rhenko@gmail.com`. |
| `RHENKO_COPYRIGHT_AGENT_NAME` | Copyright | **Not set. The agent is not registered with the US Copyright Office.** The copyright page says the operator has to register one for the US safe harbour (17 U.S.C. 512(c)) to apply, and shows the agent details only once they are set. Counsel to advise whether the safe harbour matters for an Australian-run service. |
| `RHENKO_COPYRIGHT_AGENT_EMAIL` | Copyright | Not set. Needed with the agent. Court-action notices go here. |
| `RHENKO_COPYRIGHT_AGENT_ADDRESS` | Copyright | Not set. Needed with the agent. |
| `RHENKO_EU_REPRESENTATIVE` | Privacy, Terms | Not set. Rhenko is open to EU users and is not established in the EU, so counsel must decide whether a representative is needed (GDPR Article 27). |
| `RHENKO_UK_REPRESENTATIVE` | Privacy, Terms | Not set. Same question for the UK. |
| `RHENKO_HOSTING_LOCATION` | Terms, Privacy | **Set to `Brisbane, Queensland, Australia`, as the operator says.** Check it before launch: `docs/hosting-costs.md` plans a DigitalOcean droplet, and DigitalOcean has no Brisbane data centre. The nearest is Sydney, and Bangalore is also listed. The page must name the real location. |
| `RHENKO_GOVERNING_LAW` | Terms | **Set to `Queensland, Australia`**, with the courts of Brisbane. The operator confirmed it. |

Do not use a personal or outreach email address for any of these contacts. The policy pages publish them.

## Decisions made by the operator, for counsel to confirm

Counsel may change any of these. The app and the pages follow each decision as written here until counsel does.

### Copyright and notices

1. **Copyright notice requirements. Decided: keep.** The form asks for the owner's name, postal address, telephone number, the work,
   the link, the good-faith statement, the accuracy statement, the statement under penalty of perjury, and a signature
   (`lib/notice-rules.ts`). This follows 17 U.S.C. 512(c)(3). Counsel confirms.
2. **Counter-notice requirements. Decided: keep.** The author gives a name, postal address, telephone number, a statement under
   penalty of perjury, consent to the federal district court's jurisdiction, agreement to accept service, and a signature. The owner
   receives the counter-notice in full (17 U.S.C. 512(g)). Counsel confirms the wording on `/copyright`.
3. **Restore window. Decided: 10 to 14 business days.** The post goes back no sooner than 10 and no later than 14 business days after
   the owner receives the counter-notice, unless the owner says it has started a court action. Business days leave out weekends and US
   federal holidays (`lib/business-days.ts`). X's copyright policy also uses a 10-business-day window, so this matches a large platform.
4. **One window for appeal and counter-notice. Decided: 30 days.** Both are open for 30 days after the post is hidden.
5. **Intimate-image removal deadline. Decided: 24 hours.** The app's deadline is `INTIMATE_REMOVAL_HOURS = 24`, set on each notice as
   `due_by`. The TAKE IT DOWN Act gives a covered platform 48 hours from a valid request, and eSafety's removal notices give 24 hours
   (reduced from 48, per eSafety's media release). The app uses the shorter figure for every notice, so both are met. The post is hidden
   as soon as the notice arrives. `npm run legal -- overdue` lists any notice still open after 24 hours.
6. **Repeat infringers. Decided: three upheld copyright notices against an account within 12 months lead to review and closure.** The
   app counts them: `npm run legal -- repeats` lists the accounts, and `decide` reports the count once an upheld notice reaches it. The
   app does not close accounts; the operator reviews and closes. The count is checked against `scripts/legal.mjs` by a unit test
   (`tests/legal-mirror.test.mjs`).
7. **Geographic restriction. Decided: none.** A post removed under one country's order is removed everywhere on this server. The Terms
   say so.
8. **Request log. Decided: the app keeps none.** The Privacy Policy says so, and says a proxy or host in front of the app may keep its
   own records. The reverse proxy (`deploy/Caddyfile`) has no log directive, so Caddy writes no access log by default. Counsel confirms.
9. **Age. Decided: 18, by date of birth, and a launch blocker until a stronger age check exists.** The minimum-age law requires
   platforms to take "reasonable steps" to keep under-16s from holding accounts. Australia's government fact sheet (January 2026) names
   TikTok, Instagram, Snapchat, X, Facebook and YouTube, and covers platforms that enable algorithms recommending content. It excludes
   messaging, online gaming, professional networking, and education and health services. Rhenko's For you feed is a recommendation feed,
   so it is probably covered. The fact sheet's age checks are inference, estimation and verification, and it describes date-of-birth
   verification as "typically from official documents". A date of birth typed at sign-up is not one of its methods. Date of birth alone is
   therefore unlikely to be enough. The app has no other check. Counsel must decide the position, and an age-assurance provider is likely
   needed before launch.

### Encrypted chats

1. **Reaction metadata. Decided: accept, and say so.** The server sees which reaction was made to which message, not the words. The
   Privacy Policy says so.
2. **Video refused in encrypted chats. Decided: accept at launch, and say so.** Text, photos, voice messages and files can be sent.
3. **No link previews in encrypted chats. Decided: accept, and say so.** A server fetch would show the server the URL.
4. **Translation refused for encrypted messages. Decided: accept, and say so.**
5. **Push notification text. Decided: "Encrypted message".** A notification for an encrypted message does not show the text.
6. **Chat report key. Decided: Maan Ghori holds the private key.** One copy is kept offline in a place he controls, and a second copy in
   another place he controls. Neither goes on the server or into the repository. The public half goes in the server's `.env`. Runbook
   step 4a has the steps. If the private key is lost, sealed reports cannot be read.
7. **Chat reports kept for one year. Decided: one year from the date a report is made (18 U.S.C. 2258A(h) for reports to NCMEC).** The app
   removes a report and its files one year after it was made. Nothing is deleted by hand until counsel's preservation advice is in hand.
8. **Court-action contact. Decided: `RHENKO_COPYRIGHT_AGENT_EMAIL`, once the agent exists.** Until then the copyright page shows no agent.

## Payment decisions for the operator

1. **Payment records when an account is deleted. Decided: keep them for five years from each payment, without the account, then
   delete them.** Built in this round.
   - Deleting an account copies its subscription, tip and advertising ledger rows into `financial_records` before the account's rows
     are removed (`keepPaymentRecords` in `lib/payments.ts`, called from `eraseAccount` in `actions/account.ts`). A kept row has no name,
     handle, email, payment-provider customer number, or the other person in a tip.
   - `lib/maintenance.ts` deletes each kept row once its `keep_until` date has passed. The period is `RETENTION.financialRecordsYears` in
     `lib/legal.ts`.
   - Stripe keeps its own records under its own policy. The Privacy Policy and Terms say so.
   - The table must exist before the new code runs: apply `db/postgres/upgrades/2026-11-financial-records.sql` (runbook step 3).
   - Counsel checks the five-year period against the tax and accounting law.
2. **Withdrawal right for subscriptions. Decided: 14 days, as the Terms say,** and any longer right the law gives still applies. Counsel
   confirms the wording for each market.
3. **Price changes. Decided: at least 30 days' notice,** and the right to cancel before the new price applies. The Terms say so.
4. **Advertising balance refunds. Decided: a confirmed request is paid back to the card within 14 days,** under the advertiser terms.
   The contact address for requests must be a real business address before this can be acted on.

## Launch blockers

These cannot be finished in the repository. Each needs an operator action or a decision from counsel.

- The business contact addresses (contact, privacy, grievance, copyright agent) and the registered copyright agent.
- Confirmation of the hosting location against the actual server (Brisbane, Sydney or Bangalore).
- Counsel's review of the pages and of the decisions above, and a record of it before `RHENKO_LEGAL_REVIEWED` is set.
- Age assurance beyond a typed date of birth (decision 9). The app does not yet do it, and it needs a provider.
- Image scanning for known abuse material. The app does not do this. It needs a provider and an account with it. Counsel and operator
  decide whether it is required before launch.
- Production steps in the runbook, including applying the three upgrade files before the new code. They need access to the server, which
  this session does not have.

## Verification

Run on 7 November 2026, after the changes above. Each result is from the last run of that check, after the final code change.

- `npx tsc --noEmit`: clean.
- `npm run test:unit`: 420 pass, 0 fail. This includes `tests/legal-mirror.test.mjs`, which keeps the repeat-infringer numbers the same in
  the app and in `scripts/legal.mjs`.
- `eslint` on the changed TypeScript files, `e2e/billing.mjs` and `scripts/legal.mjs`: clean.
- `npm run build`: passes.
- End-to-end, against a scratch database loaded from `db/postgres/schema.sql` and then the `2026-11-financial-records.sql` upgrade, with
  encryption on (`RHENKO_E2EE=1`), the Stripe stand-in from `e2e/stripe.env` (`E2E_STRIPE=1`), and the `legal`, `billing` and `account`
  areas: 89 passed, 0 failed. The checks include the 24-hour intimate-image deadline, and the new check that a deleted account's
  subscription record is kept for five years without its id or handle.
- Last run before the 24-hour and payment-records changes, so not rerun since: the `encrypted` and `messages` areas (110 of 110 at that
  point). The `calls` area and the full plaintext suite were not run in this round.
- Not covered by any test: the five-year purge of kept payment records (a single `DELETE` on `keep_until` in `lib/maintenance.ts`).

## What was not done

- **The benchmark against other large platforms is partial.** X's copyright policy was read. Bluesky, Reddit, Meta, Discord, WhatsApp and
  Signal were not. Two research agents stalled and were stopped without reports.
- **The eSafety figure was read from eSafety's media release**, fetched on 7 November 2026. The minimum-age facts come from the
  government fact sheet of January 2026, which does not state the date the obligation started. The TAKE IT DOWN Act's 48 hours and the
  minimum-age commencement date should be checked by counsel against the statute and the regulator's own notice.
- **The five-year purge of kept payment records** is not covered by an end-to-end test. The maintenance pass runs hourly and was not
  waited for. The SQL is a single `DELETE` on `keep_until`.
- **Image scanning and age assurance** are not implemented (see launch blockers).
