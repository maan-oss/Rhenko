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

The app now handles each of these one way. The lawyer must confirm the approach or change it. `docs/legal-operations.md`
section 6 lists what the app still does not do.

1. **Copyright notice requirements.** The form requires the owner's name, postal address, telephone number, the work, the
   link, the good-faith statement, the accuracy confirmation, a statement under penalty of perjury, and a signature
   (`lib/notice-rules.ts`). Confirm these against 17 U.S.C. 512(c)(3) and any other market the server serves.
2. **Counter-notice requirements and wording.** The author gives a name, postal address, telephone number, a statement
   under penalty of perjury, consent to the federal district court's jurisdiction, agreement to accept service, and a
   signature. The owner receives the counter-notice in full (17 U.S.C. 512(g)). Confirm the wording on `/copyright`.
3. **Restore window.** The post goes back no sooner than 10 and no later than 14 business days after the owner receives the
   counter-notice, unless the owner says it has started a court action. Business days leave out weekends and US federal
   holidays, using the list in `lib/business-days.ts`. Confirm the period and the holiday list.
4. **One window for appeal and counter-notice.** Both are open for 30 days after the post is hidden, and a post can have
   one or the other, not both. Confirm the 30 days, or set a separate period for counter-notices.
5. **Intimate-image removal deadline.** Each intimate-image notice has a deadline 48 hours after it arrives (`due_by`), and
   `npm run legal -- overdue` lists any still open after it. Confirm the deadline, and whether the TAKE IT DOWN Act applies
   to this service. The sources we found give 19 May 2026 as the covered-platform compliance date. Counsel must confirm it.
6. **Repeat infringers.** The `/copyright` page says accounts that repeatedly infringe are closed. The app does not count
   repeats or act on them. Decide the policy, and either have the app track it or change the page to match what is done.
7. **Geographic restriction.** A post removed under one country's order is removed everywhere on this server. Decide
   whether that is acceptable or whether restriction by country is needed.
8. **Request log.** The app keeps no request log, only the proxy in front of it does. Confirm that the Privacy Policy
   describes this correctly.
9. **Age.** Age assurance is the date of birth only. Confirm this is what the Terms should say.

## Decisions for counsel and product: encrypted chats

These are built as described, and each needs a decision before launch.

1. **Reaction metadata.** A reaction in an encrypted chat is sent as a plaintext emoji from a fixed list. The server sees
   which reaction was made to which message, but no words. Decide whether this metadata is acceptable, and say so in the
   Privacy Policy.
2. **Video is refused in encrypted chats.** Text, photos, voice messages and files can be sent. Decide whether this is
   acceptable at launch.
3. **No link previews in encrypted chats.** A server fetch would show the server the URL. Decide whether that is acceptable.
4. **Translation is refused for encrypted messages.** Decide whether that is acceptable.
5. **Push notification text.** A notification for an encrypted message shows "Encrypted message" (`ENCRYPTED_PREVIEW`),
   not the text. Decide whether this is the wording to keep.
6. **Chat reports and the report key.** A report is sealed to Rhenko's report public key before it is stored. Only the
   private key, kept outside the server and the repository, can open it. The operator makes the key pair once, with
   `npm run moderation -- report-keygen <file outside the repository>` (runbook 4a). Decide who holds the private key and how
   it is backed up.
7. **Reports made to NCMEC.** Each is kept for one year from the date it was made to NCMEC (18 U.S.C. 2258A(h)). Counsel
   advises on preservation before any deletion. Nothing is deleted until that advice is in.
8. **Court-action contact.** An owner's court-action notice goes to the designated agent at `RHENKO_COPYRIGHT_AGENT_EMAIL`.
   Set that address before launch.

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

Checked on 2026-11-07 against the working tree. The last commit with these checks is d3b084b on rhenko-app-features; the changes
listed below were made after it and are not committed yet.

- `npx tsc --noEmit`, eslint on the changed TypeScript files, and `npm run build`: clean. `npm run test:unit`: 419 passing.
- End-to-end, encryption off (`RHENKO_E2EE=0`): the full run, every area except `encrypted`, passed 545 of 545.
- End-to-end, encryption on (`RHENKO_E2EE=1`): the full run, every area, passed 565 of 565. The encrypted area has 20 checks and
  all pass. The messages area passes 48 of 48 in each mode.
- The email checks in the account and legal areas ran with the local mail sink (`e2e/lib/mail-sink.mjs`) up, with the server
  sending to it.
- Runbook step 5 was rehearsed on the test database inside one transaction, ended with `rollback`, so nothing was deleted. The
  dry run and the rehearsal both counted 186 plaintext messages, and the rehearsal queued 17 files. The first version of the file
  name pattern left out the voice notes and documents the app accepts, and it did not keep files a chat report still holds. Both
  are fixed in the runbook and in `scripts/moderation.mjs`, and `tests/upload-names.test.mjs` keeps the three lists the same.
- App change: a send that fails in an encrypted chat now says "Your message did not send. Check your connection and try again.",
  the same as a plaintext chat.
- Command line: `report-keygen` refuses a key file inside the repository.
- Test-side changes; none changes the app's behaviour:
  - The messages checks find an encrypted chat's rows by the label an encrypted row shows ("Encrypted message"), read the banner
    and the voice player the way an encrypted chat shows them, and wait for the save in the database, because the request holds
    sealed text.
  - The encrypted area has a check that a device whose signing key changed is refused with a notice, and that its messages read
    again once the key is back.
  - The deletion check waits for the deleted message's own text to leave the thread. A child-safety report earlier in the same
    chat also leaves a deleted notice, so waiting for any notice had let the check read the thread too early.
  - The report toast is moved away from the pointer and cleared before the next step, so it does not cover a sheet's button.
  - A 409 console error from the view beacon of a tab left open on a deactivated account is listed in `IGNORED_NOISE` in
    `e2e/run.mjs`, with its reason. The deactivate check still asserts the sign-out and the hidden-account message.
- Earlier, a phone-sized browser check confirmed the bottom bar is hidden on a chat and on the new-message page, returns on home,
  and that a sent message appears at once. Calls were not checked visually.
