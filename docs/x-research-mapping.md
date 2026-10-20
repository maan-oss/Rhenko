# X complaints mapped to Rhenko

This maps the complaints users raised about X in 2025 and 2026 to what Rhenko does today. The full research, with sources
and how sure each point is, is kept with the working notes. Each row says what was checked, and what was not.

Status key:

- **Covered**: the behaviour exists in the code or the policy pages, and was checked.
- **Partly**: something exists, but a part of the complaint is still open.
- **Gap**: the complaint applies and nothing in Rhenko addresses it yet.
- **Not checked**: not verified in this pass.
- **Not applicable**: Rhenko does not have the feature the complaint is about.

## Feed and ranking

| # | Complaint | Status | What Rhenko has | What is open |
| --- | --- | --- | --- | --- |
| 1 | The For you feed ranks by engagement, not by what people value | Partly | `lib/ranking.ts` ranks by a learned model of likes, reposts, bookmarks and dwell time. The Transparency page describes the ordering in plain words. | The default is still engagement-led. A decision is needed on a chronological default or a clearer switch (see decisions). |
| 5 | Replies ignore who you follow | Covered | Thread replies are shown oldest first (`repliesTo` in `lib/data.ts`), so no reply ranking is applied and no ranking can ignore the follow graph. Engagement sorting is used only on other lists. | Nothing needed for threads. Adding reply ranking later would need this decision again. |
| 14 | The desktop feed resets to For you | Covered (new) | Home now reopens on the tab last chosen. The choice is kept in a one-year `rhenko-feed` cookie (`lib/feed-tab.ts`, `components/app/remember-feed-tab.tsx`). An address with a tab in it still wins, and the For you link now names its tab. The Privacy Policy lists the cookie. | Lawyer to review the new Privacy Policy line. |

## Moderation, accounts and safety

| # | Complaint | Status | What Rhenko has | What is open |
| --- | --- | --- | --- | --- |
| 3 | Appeals are slow and go undecided | Partly | An appeal form (`components/app/appeal-form.tsx`). Each appeal already records when it was made and decided. The Transparency page shows appeals made, reversed, upheld and waiting, and now also the average time to decide and the oldest appeal still waiting. | Figures come from this server's own records, and the page says so. Nothing is audited. Whether the time is fast enough is for the operator to judge. |
| 4 | Bots and automated replies flood conversations | Partly | A proof-of-work puzzle (`RHENKO_PROOF_BITS`) and an optional Turnstile check (`RHENKO_TURNSTILE_VERIFY_URL`), both in `.env.example`. | Reply rate limits were not checked in this pass. |
| 6 | A paid check reads as verified | Covered | `components/app/badges.tsx`: the verified check and the paid subscriber ring are different shapes. The ring's label says "Rhenko has not checked this person's identity." | None. |
| 7 | AI edits of real people, including minors | Not checked | Sahayak is a text assistant. No image generation was found in this pass. | Search for image generation before saying this is covered. |
| 8 | Lockouts after a forced passkey migration | Covered | Passkeys are added on request in Settings, and two-factor is optional. The end-to-end passkeys checks pass. | None. |
| 11 | Scam messages from hijacked accounts | Partly | A first message to someone who does not follow back arrives as a request that must be accepted, and the e2e messages checks cover it. | No check for hijacked or "vote for me" style messages. |
| 15 | Public posts used to train AI | Covered (by policy) | The Privacy Policy says posts and messages are not used to train AI models (`app/privacy/page.tsx`). | The code path behind the sentence was not audited. |
| 16 | Location labels and indexed AI chats | Covered | No "account based in" label was found. Location is used only for "Near you" suggestions, and only when the person turns them on (`lib/connection-rank.ts`). | Whether shared links are indexed was not checked. |
| 17 | Reach is hidden and reversed on appeal | Partly | The Transparency page says paid features do not change reach. | Restriction notices for reach were not checked. |
| 18 | Ads not clearly labelled | Covered | Each ad is labelled "Ad" with its advertiser, and links to the policy (`components/app/ad-card.tsx`). The advertising transparency page exists. | Completeness of the ad repository was not checked. |
| 19 | Blocked and muted accounts still show | Partly | `visibilityClause` in `lib/data.ts` applies to listings. The visibility e2e checks cover blocks on profiles and quotes. | Search was not checked directly, and mutes were not checked. |

## Reliability, mobile and messages

| # | Complaint | Status | What Rhenko has | What is open |
| --- | --- | --- | --- | --- |
| 2 | Outages, and silence about them | Not checked | Not checked in this pass. | A public status page and an incident note policy are operator decisions. |
| 9 | Notifications delayed, duplicated or missing | Not checked | Not checked in this pass. | Deduplicate by event, and check Android deep links. |
| 10 | A slow and buggy mobile app | Partly | The bottom bar slides away in chats and new messages and returns on home. Checked in a phone-sized browser. Calls are covered by the full-screen call surface and were not checked visually. Sent messages appear at once. | Performance was not measured. A cold-start budget for low-end phones is still to set. |
| 12 | Videos that fail to play | Not checked | Not checked in this pass. | Playback checks on phones. |
| 13 | A half-built encrypted chat replacing DMs | Not applicable | Rhenko's messages already include photos, voice notes, reactions, groups and message requests (e2e messages checks). | None. Rhenko should not replace these with a smaller feature. |

## Money and developers

| # | Complaint | Status | What Rhenko has | What is open |
| --- | --- | --- | --- | --- |
| 20 | API pricing changes and sudden restrictions | Not applicable | No public API was found in this pass. | Not checked in full. |

Paid features are not a way to buy safety fixes or reach. The rules page says paid features do not buy reach, and the
Transparency page says the same.

## Decisions taken

- **Feed default.** For you stays the default, and the Following choice is now remembered (row 14). Changing the default
  itself would change what every new visitor sees, so it was not changed.
- **Reply order.** Not changed. Threads are already oldest first with no ranking (row 5), so there is nothing to add.
- **Appeal timing.** Average decision time and the oldest waiting appeal are now on the Transparency page (row 3).
- **Status page.** Not built. It needs a host and someone to post updates, which are operator decisions.

## Still open

1. **Status page.** The operator picks a host and the person who posts incident notes.
2. **Not checked yet.** Notifications, video playback, search with mutes, image generation and reply rate limits need a
   check before any claim is made about them.
