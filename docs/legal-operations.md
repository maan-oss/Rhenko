# Legal operations

This is the runbook for whoever runs a Rhenko server. The app has the tools: hiding and appeals, a notice form, a
transparency page, retention, and the command lines below. The law, the contacts and the decisions are the operator's.

**Nothing here is legal advice.** Each place a server serves people needs a lawyer to check the Terms, the Privacy Policy,
the Rules, the copyright process and this runbook before launch, and again when the law changes. The timings below were
written from the laws as they stood in October 2026. Check them before you rely on them.

## 1. What the app does for you

| Duty | Where it lives |
| --- | --- |
| Age: 18 or older, refused at sign-up and on the birthday field | `MINIMUM_AGE` in `lib/legal.ts`; sign-up and Settings |
| Agreement to the Terms and Privacy Policy, recorded with the version and time | `users.terms_version`; the agreement screen at `/accept-terms` |
| Re-agreement when the terms change | Bump `TERMS_VERSION` in `lib/legal.ts`; every account is asked again |
| Statement of reasons and appeal (DSA Articles 16, 17) | Hidden post → notice to the author → appeal in Notices → decision |
| Notice and action, with acknowledgement and decision to the sender (DSA Article 16) | `/notice` form, `scripts/legal.mjs` |
| Immediate hiding for intimate images and child sexual abuse | `URGENT_KINDS` in `lib/legal.ts`; applied when a notice or report arrives |
| Copyright notices and counter-notices (DMCA section 512) | `/copyright`, `/notice`, `/notices` |
| Retention limits enforced by the background tick | `RETENTION` in `lib/legal.ts`, `keepWithinRetention` in `lib/maintenance.ts` |
| Hidden posts deleted after the appeal window | `purgeHidden` in `lib/moderation.ts` |
| Transparency figures | `/transparency`, read from the server's records each time |
| Operator details on each page | `RHENKO_*` variables, see `.env.example` |

## 2. Before launch

Work through this list in order. Each item names who is responsible.

1. **Operator details (operator).** Set the `RHENKO_*` legal variables in `.env`: name, contact, postal address, privacy
   contact, grievance officer (India), copyright agent, EU and UK representatives where they apply, hosting location and
   governing law. A missing value shows "not yet published" on the page. It does not stop the app.
2. **Copyright agent (operator).** Register the designated agent with the US Copyright Office's directory and keep the
   registration current. Without it, the DMCA safe harbour in section 512(c) may not apply to the service.
3. **Representatives (operator + lawyer).** A representative in the EU is needed under GDPR Article 27 and under DSA
   Article 13 when the operator is not established in the EU and offers the service there. The UK needs one under UK GDPR
   Article 27 in the same way. Decide with a lawyer whether each applies.
4. **Size exemption (lawyer).** Under DSA Article 19, micro and small enterprises are exempt from some platform duties,
   including internal complaints (Article 20) and out-of-court settlement (Article 21). Work out whether the operator
   qualifies. The Terms already refer to Article 21 "where the law requires it".
5. **Age assurance (operator + lawyer).** Sign-up asks for a date of birth and refuses anyone under 18. A birthdate the
   person types is not proof of age. Australia's under-16 social media minimum age expects "reasonable steps" to check
   age, and the operator must decide what those are: an age-assurance provider, a restriction on who can sign up in
   Australia, or another method. The app does not do this yet.
6. **UK Online Safety Act (operator).** Complete the illegal-harms and children's risk assessments that Ofcom requires of
   user-to-user services, and keep them on file. Child sexual abuse material found on the service must be reported to the
   National Crime Agency under the Act's rules, which took effect in April 2026. Set up a named person and a route for the
   report, and test it.
7. **India (operator + lawyer).** Name a grievance officer, publish their contact, and answer grievances within the time
   the IT Rules set. Intimate-image complaints must be actioned within two hours under the 2026 Rules, and grievances answered within seven days. These figures were taken from secondary reporting and have not been checked against the notified text, so confirm them first. The app hides such
   posts at once, but a person must also be on call to review and decide. DPDP Act children's rules (under 18) are met by
   the age limit; confirm when the DPDP Rules commence.
8. **Australia (lawyer).** Check the privacy reforms that now apply, including the statutory privacy tort, automated
   decision-making transparency, and the Children's Online Privacy Code, which the regulator must make by December 2026.
9. **Email (operator).** Set `RHENKO_SMTP_URL` and `RHENKO_MAIL_FROM`. Without SMTP, reference and decision emails are
   printed to the log and the command line, so they must be sent by hand.
    **Translation (operator, optional).** Set `RHENKO_TRANSLATE_URL`, and `RHENKO_TRANSLATE_KEY` if the service needs a key. The
    service receives the text of each post or message a reader asks to translate, so name it in the Privacy Policy's list of
    recipients and put in place the processing terms the law requires. Without the variable, no translate button appears.
10. **Hosting and backups (operator).** Serve over HTTPS. The Compose file copies database dumps to the R2 bucket every
    hour (see the README), and remember that a backup holds deleted content until the dump that includes the deletion is
    replaced. Uploads in R2 are removed when they are deleted from the app. Keep `RHENKO_SECRET` safe: without it,
    two-factor keys cannot be read, and the key file is not in the dumps.
11. **Lawyer review (lawyer).** Review every page under `/terms`, `/privacy`, `/rules`, `/copyright`, `/safety` and
    `/legal` for each place the server serves. Record the review date.
12. **Run the suite (operator).** `ONLY=legal npm run test:e2e` against a staging server, then the full suite.

## 3. Daily work

```bash
npm run moderation -- list          # open reports, oldest first
npm run moderation -- appeals       # appeals waiting for a decision
npm run legal -- list               # open notices; urgent ones first
```

- **Urgent first.** Intimate-image and child-abuse notices are already hidden when they arrive. Decide them the same day.
- **Hide before you decide.** `npm run moderation -- hide <postId> --category <id> --explain "<reason>"` hides and tells
  the author. Use `restore` if the hiding was wrong.
- **Decide appeals.** `npm run moderation -- decide <appealId> reverse|uphold --note "<reason>"`. A reversal puts the post
  back. An upheld appeal deletes it within about 15 seconds.
- **Decide notices.** `npm run legal -- show <noticeId>`, then `npm run legal -- decide <noticeId> actioned|rejected --note
  "<reason>"`. This records the decision, hides or restores the post, and emails the sender.
- **Emergencies.** `npm run moderation -- remove <postId>` deletes a post at once, with no notice and no appeal. Use it
  only where the law requires deletion before the author can be told, and write down why.

Write the reason for each decision in a sentence a stranger could follow. The author and the sender read it.

## 4. Specific procedures

**Child sexual abuse material.** Do not open more of the material than you need to decide, and never copy or forward it.
Hide it at once (the notice form does this). Report it to the authorities the law of the place requires: NCMEC's
CyberTipline in the US (18 U.S.C. 2258A), the Internet Watch Foundation or the National Crime Agency in the UK, and the
eSafety Commissioner or the police in Australia. Keep the record of what you reported and when. Get a lawyer's advice on
preservation of evidence before you delete anything.

**Intimate images without consent.** Hide at once. In India, act within two hours of a valid complaint. Tell the person
who complained when it is done. Do not leave the content visible while you check the complaint.

**Copyright.** Check the notice has the parts in `/copyright`. Hide the post with `legal decide actioned` if the notice is
valid. The author may send a counter-notice from Notices. If none comes, or it is refused, the post stays hidden. If a
counter-notice is valid, restore the post after 10 to 14 business days unless the sender tells you a court case has
started. Track repeat infringers and close their accounts.

**Orders from courts and authorities.** Check the order is valid and comes from the right authority. Comply with what it
requires, and say so to the author where the law allows. Record it with `npm run legal -- record-request --summary "<what
it asks, who sent it, the legal basis>"`. Requests appear in the transparency figures.

**Data requests.** Users can download, correct and delete their data in Settings. Email requests come to the privacy
contact. Answer within one month (GDPR and UK GDPR), and within the time the DPDP Rules set for India. Log each request
and the answer in the operator's own records, because the app does not keep a request log.

**Breaches.** Contain the breach first (rotate keys, close the hole). Then assess the risk to people. Tell:
- the regulator within 72 hours of finding a breach that is likely to risk people's rights (GDPR and UK GDPR);
- the Office of the Australian Information Commissioner, as soon as practicable, where serious harm is likely (Notifiable Data Breaches);
- the Data Protection Board of India and the affected people without delay, as the DPDP Act requires.
Tell affected people in plain words what happened, what data, and what they can do. Record every step.

**Retention.** The tick removes views and profile visits after 90 days, For you impressions and time on screen after 30 days, read
notifications after 180 days, notices and moderation records after three years, and "Not now" choices on connection suggestions after
180 days. Translations are removed with the post when it is edited, and with the message when it is deleted. The For you ranking is refit from those
impressions once an hour (`trainFeedModel` in `lib/feed-learning.ts`); its weights hold no record of any one person. Check the backups too: they keep what was deleted until they are replaced.

## 5. Reviewing the figures

The transparency page shows the counts from the server's own records. They are not an audit. Once a year, record the
figures in a document signed by the operator, and check them against the notice and appeal records. If the service is
large enough for a formal transparency report under the DSA, the lawyer will say what it must contain.

## 6. What the app does not do yet

- Age assurance beyond the date of birth (see section 2, item 5).
- Geographic restriction. A post removed under one country's order is removed everywhere on this server.
- A request log. Only the proxy or host in front of the app keeps one.
- Automated scanning of images for known abuse material. The operator must add that, with a provider, if it is required.
- Audited transparency reports.
- Posting, following, messages, lists, circles, calls, payments, advertising, the feed and the media routes refuse an account that has not agreed to the current Terms (`requireAgreedViewer` and `getAgreedViewer`). Account actions (password, two-factor, sessions, email, deactivation and deletion) still accept it, so a person can always secure or leave their account. Every new server action must use one of the two checks unless it is an account action.
- Counter-notice details the copyright law asks for: the appeal form takes only a reason of at least 10 characters. The copyright notice form does not take a statement under penalty of perjury. Lawyer to decide whether to add both.
- Timing for putting a post back after a counter-notice is set by the operator by hand, and is not tracked by the app.
- Intimate-image removal deadlines are not tracked, and there is no self-harm detection.
