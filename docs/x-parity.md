# X parity: what Rhenko has, what it is missing, and what is being built

This is the working list for matching X (formerly Twitter) feature for feature, where the feature is one people use. It
says what X offers as of mid-2026 (from its help pages and the 2026 launch coverage), what Rhenko already has (from the
code and the README), and what happens next. "Decide" rows are product or legal choices that need the operator, and the
work for them is not started.

Sources for the X side: X's help pages, XChat's launch coverage (April 2026), the closing of X Communities in favour of
Groupchat links (2026 coverage), and the X Android rebuild coverage (July 2026). Where a claim could not be checked, the
row says so.

## Status key

- **Have**: built and listed in the README.
- **Partly**: something exists; the part that is missing is named.
- **Missing**: X has it and Rhenko does not.
- **Decide**: needs an operator or legal decision before it is built.
- **Not doing**: X has it, and Rhenko will not build it. The reason is given.

## Posting and reading

| Feature | X | Rhenko | Status / plan |
| --- | --- | --- | --- |
| Text posts, up to 25,000 characters | Yes | Yes | Have |
| Photos, video, alt text, sensitive-media flag | Yes | Yes | Have |
| Video length and file size | Premium allows longer video (not verified in this pass) | 140 seconds, 100 MB | Decide (cost and hosting) |
| Polls | Yes | Yes | Have |
| Threads | Yes | Yes | Have |
| Articles (long posts with a title) | Yes | Yes | Have |
| Replies, quotes, reposts, likes, bookmarks | Yes | Yes | Have |
| Edit a post, with edit history | Yes (Premium) | Yes, 60 min (Plus 24 h), history | Have |
| Undo a new post | No | Yes, 10 seconds | Have |
| Drafts and scheduled posts | Yes | Yes | Have |
| Pin and highlight | Yes | Yes | Have |
| Link preview cards | Yes | Yes (title and description only) | Have |
| Embed a post on another site | Yes | Yes | Have |
| Community notes | Yes | Yes | Have |
| Post analytics and view counts | Yes | Yes | Have |
| Cashtags ($TICKER) | Yes, 2026 | No | **Building** (feat/cashtags) |
| GIF search and picker | Yes | No | **Building** (feat/gif-search). Needs a GIF provider key before it works. |
| Video editor (trim before posting) | Yes, rolling out 2026 | No | Missing. Next batch. |
| React to a post with a video | Yes, 2026 | No | Missing. Decide what it adds beyond a reply. |
| Custom timelines | Yes, 2026 | Lists have a timeline | Partly. Decide whether topic and keyword timelines are needed. |
| Hide replies, reply limits | Yes | Hide replies: yes. Who can reply: yes. | Have |
| Translate a post | Yes | Yes | Have |
| Keyword mute | Yes | Yes, feeds and search | Have |

## Feeds, search and discovery

| Feature | X | Rhenko | Status / plan |
| --- | --- | --- | --- |
| For you and Following feeds | Yes | Yes | Have |
| Remember the chosen feed | Yes | Yes | Have |
| Search with operators and filters | Yes | Yes | Have |
| Trending topics | Yes | Yes | Have |
| Topic pages and following a topic | Yes | Yes | Have |
| Explore: news, sports, entertainment tabs | Yes | No | Missing. Needs a curated source, so decide the source first. |
| Who to follow | Yes | Yes | Have |
| "Near you" suggestions | Yes | Yes, opt-in | Have |
| Search history | Yes | Yes | Have |

## Profiles and relationships

| Feature | X | Rhenko | Status / plan |
| --- | --- | --- | --- |
| Profile, banner, website, location, birthday | Yes | Yes | Have |
| Follow, protected accounts, follow requests | Yes | Yes | Have |
| Block and mute, both directions | Yes | Yes | Have |
| Followers and following lists | Yes | Yes | Have |
| Lists, public and private | Yes | Yes | Have |
| Bookmark folders | Yes | Yes | Have |
| Account switching (several accounts on one device) | Yes | Yes, up to 5 | Have |
| Verified badges (checked and paid) | Yes | Yes | Have |
| Creator subscriptions (paid, subscriber-only posts) | Yes | No | Decide. The plan is in docs/creator-subscriptions.md. |
| Tips to creators | Yes | Yes | Have |
| Plus subscription | Yes (Premium) | Yes | Have |

## Messages

| Feature | X | Rhenko | Status / plan |
| --- | --- | --- | --- |
| Direct messages, groups, requests | Yes | Yes (groups up to 50) | Have |
| Reactions, unsend, photos, voice notes | Yes | Yes | Have |
| Read receipts and typing | Yes | Yes | Have |
| Voice and video calls | Yes | Yes (one to one video, group voice up to 6) | Have |
| Disappearing messages | Yes (XChat) | No | **Building** (feat/dm-timers-invites) |
| Group invite links (Groupchat links, up to 350 members) | Yes (XChat, 2026) | No | **Building** (feat/dm-timers-invites). Group size limit is a decision. |
| End-to-end encryption | Yes (XChat) | No. Messages are readable on the server, so moderation and multi-device sign-in work. | Decide. It changes key handling, search and moderation, so it is an operator decision. |
| Screenshot blocking | Yes (XChat, iOS) | No | Not doing. Browsers cannot block screenshots. |
| Screen sharing in calls | Yes | No | **Building** (feat/screen-share) |
| Communities | Being closed in 2026 | Circles (open, request, invite) | Have. Rhenko's circles are the replacement X is moving to. |

## Notifications and realtime

| Feature | X | Rhenko | Status / plan |
| --- | --- | --- | --- |
| In-app notifications, filtered by type | Yes | Yes | Have |
| Push notifications when the app is closed | Yes | No. The in-app feed works while open. | **Building** (feat/web-push). Needs VAPID keys set in the environment. |
| Email notifications | Yes | Partly. Codes and some account mail only. | Missing. Next batch. |
| Live updates while open | Yes | Yes (server-sent events) | Have |

## Live audio and video

| Feature | X | Rhenko | Status / plan |
| --- | --- | --- | --- |
| Spaces (live audio rooms) | Yes, hosting on Android in 2026 | No | Missing. Needs a media server (SFU) and moderation for live audio. Not started. |
| Live video | Yes | No | Missing. Same media server as Spaces. Not started. |

## Money, AI and business

| Feature | X | Rhenko | Status / plan |
| --- | --- | --- | --- |
| Ads, advertiser accounts, ad labels | Yes | Yes | Have |
| Ad credit and self-serve ads | Yes | Yes (ad credit) | Have |
| AI assistant | Yes (Grok) | Yes (Sahayak, text) | Have |
| Creator bot or AI program payouts | Yes (2026) | No | Not doing for now. It needs a payments and tax setup. Decide later. |
| Payments and money transfers (X Money) | Yes | No | Not doing. It needs a money licence and a payment partner. |
| Jobs | Yes | No | Not doing for now. Needs an employer product and a review process. |
| Shopping | Yes | No | Not doing. Needs merchant onboarding and a catalogue. |
| AI image generation of people | Yes, with limits | No | Not doing. Generating images of real people is a harm the product will not take on. |

## Safety, accounts and trust

| Feature | X | Rhenko | Status / plan |
| --- | --- | --- | --- |
| Two-factor, passkeys, sessions | Yes | Yes | Have |
| Data download | Yes | Yes | Have |
| Deactivate and delete | Yes | Yes | Have |
| Appeals with timing published | Yes | Yes | Have |
| Transparency pages | Yes | Yes | Have |
| Metadata removed from uploads | Partly | Photos only. Video metadata is kept. | **Building** (feat/video-metadata) |
| Terms check on every write | n/a | Most actions check. Passkey and some account actions did not. | Fixed in this batch |

## Bugs and gaps found in the code

- Video uploads keep their metadata, which can include location. Being fixed in feat/video-metadata.
- Passkey registration and some account writes checked sign-in but not agreement to the current Terms. Being fixed.
- The README said server actions did not check agreement. Most do, so the note was out of date. Corrected.
- Mutes and muted words are applied to search (lib/data.ts and actions/search.ts). Confirmed in code.
- Notifications delayed or duplicated, video playback on phones, reply rate limits, outages: not yet checked. Next batch.
