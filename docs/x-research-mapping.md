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
| 4 | Bots and automated replies flood conversations | Partly | A proof-of-work puzzle (`RHENKO_PROOF_BITS`) and an optional Turnstile check (`RHENKO_TURNSTILE_VERIFY_URL`), both in `.env.example`. | Checked in `actions/posts.ts`: replies go through `createPost`, so the posting limit (30 a minute) and the account check (`gate`) apply. Likes (240 an hour, 60 for new accounts), reposts (120/30), bookmarks (300/60) and reports (20/5) are limited in `toggleLike`, `toggleRepost`, `toggleBookmark` and `reportPost`; follows (60 an hour and 300 a day, 20/40 for new accounts) in `toggleFollow` (`actions/social.ts`). Fixed: `publishNow` sent a draft out without the account check. Open: posts and replies have a per-minute limit only, so an account can still post 1,800 an hour. |
| 6 | A paid check reads as verified | Covered | `components/app/badges.tsx`: the verified check and the paid subscriber ring are different shapes. The ring's label says "Rhenko has not checked this person's identity." | None. |
| 7 | AI edits of real people, including minors | Covered | Sahayak is a text assistant. No image generation was found in this pass. | Searched `lib`, `actions`, `app`, `components`, `scripts` and `package.json` for image generation (images.generate, DALL-E, Stable Diffusion, Imagen, OpenAI, Replicate, fal and similar): none. The only AI call is `askSarvam` in `lib/sarvam.ts`, a text chat completion. Adding image generation would need this row again. |
| 8 | Lockouts after a forced passkey migration | Covered | Passkeys are added on request in Settings, and two-factor is optional. The end-to-end passkeys checks pass. | None. |
| 11 | Scam messages from hijacked accounts | Partly | A first message to someone who does not follow back arrives as a request that must be accepted, and the e2e messages checks cover it. | Checked in `actions/messages.ts` and `lib/data.ts`: no link preview is fetched for a message (`requestPreviews` runs only in `fetchCores`, for posts), and links in messages are plain links. A shared post shows its own card. Fixed: sharing a post with someone new (`sharePostWith`), `createGroup` and `addToGroup` sent requests to strangers without the account check or the new-conversation limit that `startConversation` has; all now use `mayReachNewPeople`. Open: message text is not screened the way posts are, nothing detects a hijacked account, and links in a request work before it is accepted. |
| 15 | Public posts used to train AI | Covered (by policy) | The Privacy Policy says posts and messages are not used to train AI models (`app/privacy/page.tsx`). | The code path behind the sentence was not audited. |
| 16 | Location labels and indexed AI chats | Covered | No "account based in" label was found. Location is used only for "Near you" suggestions, and only when the person turns them on (`lib/connection-rank.ts`). | Whether shared links are indexed was not checked. |
| 17 | Reach is hidden and reversed on appeal | Partly | The Transparency page says paid features do not change reach. | Checked `app/transparency/page.tsx`, `lib/screening.ts` (`screenPost`), `lib/data.ts` (`NOT_RESTRICTED`) and `lib/risk.ts` (`gate`). A limited account is told why (`RESTRICTED_MESSAGE`). A post the automatic check marks "limit" stays up but is left out of other people's For you and sends no notifications, and its author is not told: no notice is made, so there is nothing to appeal. The Transparency page does not mention post limits. Only a held post gets a notice. Wording is an operator decision and was not changed. |
| 18 | Ads not clearly labelled | Covered | Each ad is labelled "Ad" with its advertiser, and links to the policy (`components/app/ad-card.tsx`). The advertising transparency page exists. | Completeness of the ad repository was not checked. |
| 19 | Blocked and muted accounts still show | Covered | `visibilityClause` in `lib/data.ts` applies to listings. The visibility e2e checks cover blocks on profiles and quotes. | Checked in `lib/data.ts`: blocks apply to the profile (`getProfileByHandle`, and `feedFor` in `lib/feeds.ts`), reply threads (`repliesTo`, and the parent through `canSeePost`), quotes (`loadPosts`), the owner-only Likes tab, people search (`searchUsers`) and notifications (`SHOWN_NOTIFICATION`). Mutes and muted words apply to feeds, post search (`searchPostFeed`), topic pages (`topicFeed`) and reply threads. There is no public liked-by or quotes list. Fixed: people search now leaves out muted accounts, and muted words now also match article titles (`mutedWordFilter` in `lib/social-rules.ts`). Open, by design: a post opened by its link or quoted is not hidden by a mute, and a muted word matches inside longer words. |

## Reliability, mobile and messages

| # | Complaint | Status | What Rhenko has | What is open |
| --- | --- | --- | --- | --- |
| 2 | Outages, and silence about them | Not checked | Not checked in this pass. | A public status page and an incident note policy are operator decisions. |
| 9 | Notifications delayed, duplicated or missing | Partly | Pushes are sent once per event (`pushed_events`, `lib/push.ts`). Undoing a like, repost or follow removes its notification, and editing a post sends nothing again (`editPost` only re-screens). | Checked `lib/notify.ts`, `lib/post-writes.ts` (`announcePost`), `lib/screening.ts`, `lib/maintenance.ts`, `actions/posts.ts` and `actions/social.ts`. Fixed: a scheduled post was announced by every feed read and maintenance pass that found it due at once (`publishDue`), Publish now could announce twice, an overlapping maintenance pass could tell poll voters twice (`announceEndedPolls`), and likes, reposts and follows sent at once notified twice. Open: pushes wait in memory and are lost on a restart; a new post notifies before its 10-second undo window closes, so a push can arrive for a post that was taken back; Android deep links were not tested on a device. |
| 10 | A slow and buggy mobile app | Partly | The bottom bar slides away in chats and new messages and returns on home. Checked in a phone-sized browser. Calls are covered by the full-screen call surface and were not checked visually. Sent messages appear at once. | Performance was not measured. A cold-start budget for low-end phones is still to set. |
| 12 | Videos that fail to play | Partly | Videos play inline (`playsInline`), load metadata only, never autoplay, and are served with the type of their format (`contentTypeFor` in `lib/uploads.ts`). Range requests get 206 answers from local storage (`serveObject` in `lib/storage.ts`); R2 and Supabase links answer them themselves. | Checked `components/app/media-grid.tsx`, `app/media/[file]/route.ts`, `lib/storage.ts`, `lib/video-metadata.ts` and `lib/csp.ts`. Fixed: MP4 and MOV were written with their index at the end, so a phone had to fetch the end of the file first (now `+faststart`), and with Supabase storage the page policy blocked every photo and video. Open: no poster frame, so iOS shows an empty tile until play; videos are copied, not converted, so HEVC and MOV files do not play in every browser; not tested on real phones. |
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
2. **Checked in the audit.** Notifications, video playback, search with mutes, image generation and reply rate limits
   were checked, and the rows above say what is still open. Phone playback and Android deep links still need a device.
