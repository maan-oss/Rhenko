# Lawyer review packet

This is what a lawyer needs to review the legal text of Rhenko: what the operator must supply first, the decisions the operator has
made (with the reasons), the payment decisions, and what is still open. The step-by-step launch checklist is in
[legal-operations.md](legal-operations.md).

## Status (8 November 2026)

- The legal pages are drafts. Each carries a draft notice, shown until `RHENKO_LEGAL_REVIEWED=1` is set (`app/_legal/shell.tsx`).
- `RHENKO_LEGAL_REVIEWED` is not set and must not be set until a lawyer's review is on record. The operator has said the text was
  reviewed; no review record or list of changes has reached the repository, so this packet still treats it as unreviewed.
- The operator has made the decisions below, so counsel can confirm or change them. Each is marked **Decided** and says what the app
  and the pages do now. Where the assistant made a decision on the operator's instruction, the entry says so.
- Where a value is missing, the page says it has not been published. Nothing was filled from a guess.

## Pages in scope

| Page | Path | What it covers |
| --- | --- | --- |
| Terms of Service | `app/(marketing)/terms/page.tsx` | Accounts, age, content, subscriptions and tips, cancellation and withdrawal, ending use |
| Privacy Policy | `app/(marketing)/privacy/page.tsx` | What is collected, why, who receives it, how long it is kept, rights, the India grievance route |
| Rules | `app/(marketing)/rules/page.tsx` | What people may post, and what happens when a rule is broken |
| Safety | `app/(marketing)/safety/page.tsx` | Reporting, the route for intimate images and other harms, emergency wording |
| Notice | `app/(marketing)/notice/page.tsx` | How to report unlawful content |
| Copyright | `app/(marketing)/copyright/page.tsx` | The copyright notice, the counter-notice, repeat infringers |
| Transparency | `app/(marketing)/transparency/page.tsx` | Moderation and appeals figures for this server, and what Rhenko Plus includes |
| Advertising transparency | `app/(marketing)/transparency/ads/page.tsx` | Advertising policy, how ads are paid for, and the ad library |
| Legal index | `app/(marketing)/legal/page.tsx` | Links to every page above |

The operator details the pages read come from `app/_legal/operator.tsx`, which reads the `RHENKO_*` variables listed in `.env.example`.

## Changes to the legal text on 8 November 2026

- **Terms version** is now `2026-11-08-1`. Every account must accept it again before it can use the app.
- **Terms, Who can use Rhenko:** the date of birth is what the person tells Rhenko. To post, reply, quote, repost, send messages or upload
  media, the person must also confirm their age with an identity check. Until then they can read and follow. A person under 18 can read
  but cannot post or message.
- **Privacy, Age check:** a new bullet under "What is stored". The identity document and selfie go to Stripe, not to Rhenko. Rhenko keeps
  the result and the date the check was made. The Stripe paragraph under "Who else receives data" says the same.
- **Transparency, Rhenko Plus:** the Plus bullet lists the five benefits and says the upload limit is the same for everyone apart from
  the video length (see Rhenko Plus below).
- **Advertising:** "An advertising account belongs to one adult with a birthday" is unchanged. Counsel may want it to refer to the
  identity check as well.

## Earlier changes (7 November 2026)

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
| `RHENKO_CONTACT_EMAIL` | Terms | **Set to `info.rhenko@gmail.com`, as the operator chose.** It is a personal mail account. A business address on a domain the operator controls is still advised before launch. |
| `RHENKO_PRIVACY_EMAIL` | Privacy | Same as above. Used for data requests. |
| `RHENKO_GRIEVANCE_OFFICER` | Privacy (India) | **Set to `Mahesh Ghori`.** India's IT Rules 2021 require a grievance officer. |
| `RHENKO_GRIEVANCE_EMAIL` | Privacy (India) | Set to `info.rhenko@gmail.com`. Must be read by the grievance officer. |
| `RHENKO_COPYRIGHT_AGENT_NAME` | Copyright | **Not set. The operator must register the agent himself** (see the steps below). The copyright page says the operator has to register one for the US safe harbour (17 U.S.C. 512(c)) to apply, and shows the agent details only once they are set. Counsel to advise whether the safe harbour matters for an Australian-run service. |
| `RHENKO_COPYRIGHT_AGENT_EMAIL` | Copyright | Not set. Needed with the agent. Court-action notices go here. |
| `RHENKO_COPYRIGHT_AGENT_ADDRESS` | Copyright | Not set. Needed with the agent. |
| `RHENKO_EU_REPRESENTATIVE` | Privacy, Terms | Not set. Rhenko is open to EU users and is not established in the EU, so counsel must decide whether a representative is needed (GDPR Article 27). |
| `RHENKO_UK_REPRESENTATIVE` | Privacy, Terms | Not set. Same question for the UK. |
| `RHENKO_HOSTING_LOCATION` | Terms, Privacy | **Set to `Brisbane, Queensland, Australia`, as the operator says.** Check it before launch: `docs/hosting-costs.md` plans a DigitalOcean droplet, and DigitalOcean has no Brisbane data centre. The nearest is Sydney, and Bangalore is also listed. The page must name the real location. |
| `RHENKO_GOVERNING_LAW` | Terms | **Set to `Queensland, Australia`**, with the courts of Brisbane. The operator confirmed it. |

### Registering the copyright agent (operator's own step)

The operator does this in his own account. The assistant cannot: it needs his login and a fee.

1. Go to the US Copyright Office's designated agent directory on copyright.gov and create the account there.
2. Give the agent's name, postal address, telephone number and email (use `info.rhenko@gmail.com` or a business address on a domain
   the operator controls).
3. Pay the filing fee shown on the site.
4. Set `RHENKO_COPYRIGHT_AGENT_NAME`, `RHENKO_COPYRIGHT_AGENT_EMAIL` and `RHENKO_COPYRIGHT_AGENT_ADDRESS` to the same details.
5. Diary a renewal. The designation lapses and must be renewed every three years.

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

### Age

9. **Age. Decided: 18, by a date of birth given at sign-up, and an identity check before an account can post, reply, message, upload or
   change its picture.** Built on 8 November 2026 (decision made by the assistant on the operator's instruction, for counsel to confirm).
   - The check is a Stripe Identity document check with a matching selfie (`lib/age-assurance.ts`). Stripe returns the result and the
     date of birth. Rhenko keeps only the result (`age_check`: `none`, `pending`, `adult` or `not_adult`) and the time it was checked
     (`age_checked_at`). The Stripe session is then redacted, so the document and selfie are deleted on Stripe's side.
   - The gate fails closed. A check that is still running, cancelled, or returns no usable date of birth leaves the account at `none` or
     `pending`. Only `adult` may post.
   - Reading, liking and following stay open for every account, so an under-18 user can read but cannot post or message.
   - **Existing accounts are not grandfathered.** Every account starts at `none` when the upgrade runs, so each existing user must complete
     the check before posting. The runbook says so (`docs/e2ee-switch-over-runbook.md`, step 3).
   - **Gap:** Stripe's terms do not allow identity checks on minors or under-16s, so this check cannot screen them. Australia's
     minimum-age rule names under-16s. An age-estimation provider is needed for that, and it is a launch blocker.
   - Advertising still uses the date of birth the person declared. Counsel decides whether that is enough for ads.
   - Stripe Identity must be enabled on the account and checked for availability to an Australian business before launch. Its public
     beta covers Australian businesses. The webhook events it needs are listed in the runbook's checklist.
   - Counsel must decide whether the position under the minimum-age rule holds with this check plus the under-16 provider, and whether
     the government's age-assurance guidance accepts it.

### Images and videos

10. **Image and video scanning. Decided: refuse every photo and video until a scanner for known abuse material is connected.** Built on
    8 November 2026 (decision made by the assistant on the operator's instruction, for counsel to confirm). `lib/image-scan.ts` is
    fail-closed. `RHENKO_IMAGE_SCAN` unset or `none` refuses every photo and video. The test value `test` is accepted only outside
    production, so the end-to-end checks can upload media. Any other value is refused and logged.
    - This is the largest product limit at launch: photos and videos cannot be shared on Rhenko until a provider is connected. Text posts
      and messages still work.
    - Scanning also needs an adapter for the provider. The provider is not yet chosen or signed (see launch blockers).

### Encrypted chats

1. **Reaction metadata. Decided: accept, and say so.** The server sees which reaction was made to which message, not the words. The
   Privacy Policy says so.
2. **Files in encrypted chats. Decided: text messages only, until a scanner can read sealed files.** Video is refused. Photos, voice
   messages and documents are refused too, because the server cannot see inside a sealed file to tell them apart (decision 11). This
   replaces the earlier plan to accept photos, voice messages and files at launch.
3. **No link previews in encrypted chats. Decided: accept, and say so.** A server fetch would show the server the URL.
4. **Translation refused for encrypted messages. Decided: accept, and say so.**
5. **Push notification text. Decided: "Encrypted message".** A notification for an encrypted message does not show the text.
6. **Chat report key. Decided: Maan Ghori holds the private key.** One copy is kept offline in a place he controls, and a second copy in
   another place he controls. Neither goes on the server or into the repository. The public half goes in the server's `.env`. Runbook
   step 4a has the steps. If the private key is lost, sealed reports cannot be read.
7. **Chat reports kept for one year. Decided: one year from the date a report is made (18 U.S.C. 2258A(h) for reports to NCMEC).** The app
   removes a report and its files one year after it was made. Nothing is deleted by hand until counsel's preservation advice is in hand.
8. **Court-action contact. Decided: `RHENKO_COPYRIGHT_AGENT_EMAIL`, once the agent exists.** Until then the copyright page shows no agent.
9. **Sealed files are refused for all types.** Decided with decision 10 above. Counsel should confirm that refusing voice messages and
   documents in encrypted chats is acceptable at launch.

## Rhenko Plus

The subscription is paid through Stripe. The Plus badge is the `paid_verified` flag, set by the upgrade `db/postgres/upgrades/2026-11-plus-badge.sql`
for accounts with an active or trialing Plus subscription.

Five benefits, as the Transparency page states them:

1. No ads in the home feed.
2. A 24-hour window to edit a post.
3. A paid subscriber ring on the profile.
4. An animated GIF profile picture.
5. Videos up to 10 minutes (600 seconds), against 2 minutes 20 seconds (140 seconds) for everyone else.

The comparison with X, feature by feature, with a test column for each claim, is in `docs/plus-comparison.md`. Where a claim could not be
tested, the document says so.

Known gaps, stated in the comparison document:
- A lapsed Plus account keeps its GIF profile picture.
- Animated banners are open to everyone, not only Plus.
- Video in encrypted chats uses the same limit as everyone else. (Video is refused in encrypted chats for now; see decision 2.)
- A trimmed 10-minute video may exceed the three-minute processing budget. Not measured.
- One analytics claim in the comparison document is unverified and marked as such.

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

- The business contact addresses (contact, privacy, grievance, copyright agent) and the registered copyright agent, which the operator
  registers himself.
- Confirmation of the hosting location against the actual server (Brisbane, Sydney or Bangalore).
- Counsel's review of the pages and of the decisions above, and a record of it before `RHENKO_LEGAL_REVIEWED` is set.
- **An age-estimation provider** for under-16s, which the identity check cannot screen (decision 9).
- **A scanner for known abuse material**, with an adapter in `lib/image-scan.ts`. Until it is connected, photos and videos are refused
  (decision 10), and so are all files in encrypted chats (encrypted decision 2).
- Stripe Identity enabled and checked for an Australian business account, and the four identity webhook events configured on the live
  Stripe webhook.
- Production steps in the runbook: applying the five upgrade files before the new code, the webhook, and the Plus price in the live
  Stripe account. They need access to the server, which this session does not have.
- Existing users must complete the identity check before they can post (decision 9). Tell them before the switch.

## Verification

Run on 8 November 2026, after the final code change.

- `npx tsc --noEmit`: clean.
- `npm run test:unit`: 430 pass, 0 fail. This includes the age rules (`tests/age-rules.test.mjs`) and the image-scan rules
  (`tests/image-scan.test.mjs`), and `tests/legal-mirror.test.mjs`, which keeps the repeat-infringer numbers the same in the app and in
  `scripts/legal.mjs`.
- `eslint` on the changed TypeScript files: clean.
- End-to-end, on the production build (`npm run build`, then `node server.mjs` with `RHENKO_IMAGE_SCAN` unset, on a scratch database
  loaded from the schema and all five upgrade files, with `E2E_STRIPE=1` and the Stripe stand-in): 278 checks pass and 26 fail. Each
  of the 26 needs a photo, video, voice message, document or animated avatar, which production refuses by design (decision 10 and
  encrypted decision 2). Some are checks that follow one of those refusals in the same conversation, such as the edit check, whose
  composer still holds the refused document. The age area passes 4 of 4, including the under-18 check. The legal area passes 42 of 42,
  including the intimate-image deadline, the notice form and the appeal flow.
- End-to-end, on the development server with the test scanner (`RHENKO_IMAGE_SCAN=test`, outside production only): the media checks
  pass in every area. The failures in that run were development-only: a Next.js check for uncached data during navigation, a React
  warning in the forward dialog, a stale server-action id after the server compiled new code, and one check that timed out waiting
  for a navigation. Each of those checks passes on the production build.
- The production build is the release build. The development server runs only to let the test scanner accept media, and that switch is
  refused in production.

## What was not done

- **The benchmark against other large platforms is partial.** X's copyright policy was read. Bluesky, Reddit, Meta, Discord, WhatsApp and
  Signal were not. Two research agents stalled and were stopped without reports.
- **The eSafety figure was read from eSafety's media release**, fetched on 7 November 2026. The minimum-age facts come from the
  government fact sheet of January 2026, which does not state the date the obligation started. The TAKE IT DOWN Act's 48 hours and the
  minimum-age commencement date should be checked by counsel against the statute and the regulator's own notice.
- **The five-year purge of kept payment records** is not covered by an end-to-end test. The maintenance pass runs hourly and was not
  waited for. The SQL is a single `DELETE` on `keep_until`.
- **Age-estimation for under-16s and the scanner for known abuse material** are not implemented (see launch blockers).
- **Stripe Identity** has not been run against Stripe's live service. The end-to-end checks use the stand-in in `e2e/lib/stripe-mock.mjs`.
- **The "advertising account belongs to one adult with a birthday" line** was left as it is (see Changes).
