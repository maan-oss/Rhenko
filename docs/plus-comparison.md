# Rhenko Plus compared with X's subscriptions

Written 7 November 2026.

The X side comes from X's help pages, as fetched on 7 November 2026. Those facts were not re-checked for this document. One
claim is marked unverified below. The Rhenko side comes from the code and tests named in each row. Every "works now" row has a
test that would fail if the benefit were removed or enforced only in the browser.

## Status key

- **Works now**: built, enforced on the server, and covered by a test.
- **Deliberately not offered**: Rhenko could build it, and does not, for the reason given.
- **Not built**: X has it, Rhenko does not offer it, and no decision has been made.

"Rhenko free" means what everyone gets without paying. Rhenko Plus is one subscription. It has five benefits, and nothing else:
no ads in the home feed, editing a post for a day, the paid subscriber ring, an animated profile picture, and videos up to 10
minutes long.

## Subscriptions side by side

| Feature | X tier | Rhenko Plus | Rhenko free | Status | Test |
| --- | --- | --- | --- | --- | --- |
| Long posts, up to 25,000 characters | Basic (all tiers) | Same as free | Up to 25,000 characters | Works now, for everyone. Not a paid feature. | `e2e/posts.mjs`: "a post over 25,000 characters cannot be sent" |
| Editing a post | Basic: 1-hour window, limited changes | 24 hours | 60 minutes. Replies: 5 minutes for everyone. | Works now | `tests/edit-window.test.mjs` (the windows). `e2e/billing.mjs`: a Plus account edits a two-hour-old post, and a free account is not offered the edit. |
| Longer video | Basic: up to about 3 hours and 8 GB at 1080p | Up to 600 seconds (10 minutes), within the same 100 MB limit | Up to 140 seconds (2 minutes 20 seconds), 100 MB | Works now. Rhenko's limit is much shorter than X's, on purpose. | `tests/video-metadata.test.mjs`: a 150-second video is refused over 140 and accepted within 600; a 620-second video is refused even with Plus. `e2e/billing.mjs`: a free account is asked to trim a 2:30 video; a Plus account posts a 5-minute video whole. |
| Reply prioritisation (a boost in reply order) | Basic: small boost. Premium: larger. Premium+: largest. | No boost. Replies are ordered as they are for everyone. | No paid boost | Deliberately not offered. Paying does not change reach. | None automated. The rule is stated on the Plus page and in the Terms. |
| Ads | Premium: about 50% fewer ads in For You and Following. Premium+: no ads on X. | No ads in the home feed. Rhenko shows ads only in the home feeds, so this removes all of them. | Labelled ads in the home feeds, for adults only | Works now | `e2e/billing.mjs`: a Plus account's home feed has no ad, and a free adult's has one. `e2e/ads.mjs`: "a Plus subscriber sees no ads". |
| Paid subscriber ring | Not in the X facts used here. The nearest is the Premium blue check. | A ring beside the name. It shows that the person pays. It does not check who they are. | No ring | Works now | `e2e/billing.mjs`: the ring shows on Plus posts and not the verified check; the ring shows in Priority settings; the older badge keeps it. |
| Blue check (verified account) | Premium: checkmark after review | Not included, and not sold | Granted by hand by the operator (`scripts/grant-verified.mjs`), not sold | Deliberately not offered. The verified check is not part of any purchase. | None automated. The ring test above checks that a paid account never shows the verified check. |
| Animated profile picture | Not in the X facts used here | An animated GIF as the profile picture | Still pictures only | Works now | `e2e/billing.mjs`: refused by the picker and by the server for a free account; a still picture still works; a Plus account's GIF is kept. |
| Bookmark folders | Basic (all tiers) | Same as free | Yes | Works now, for everyone. Not a paid feature. | None automated found. |
| Text formatting: bold, italic, strikethrough | Basic (all tiers) | Same as free | Yes: `**bold**`, `*italic*`, `~~strike~~` | Works now, for everyone | None automated found. The parser is `components/app/post-body.tsx`. |
| Custom app icons | Basic | Not part of Plus | Not built | Not built | None |
| Creating a Community | Basic | Not part of Plus | Circles, which are groups of people, are free for everyone. They are not a copy of X Communities. | Works now (free), not a like-for-like match | `e2e/circles.mjs` |
| Analytics | Not listed on X's Premium help page. A 2025 press article said they come with Premium. Unverified. | Not a Plus benefit | Free for everyone (`app/(app)/analytics`) | Works now, for everyone | `e2e/auth.mjs` loads `/analytics` for a signed-in account. It does not check the figures. |
| Replies to verified-only posts | Premium | Not offered | Reply settings are everyone, following, or mentioned. There is no verified-only option. | Not built | None |
| Creator revenue sharing and subscriptions | Premium: eligibility for revenue sharing and subscriptions | Not offered. Plus is a subscription to Rhenko, not to a creator. | Tips to creators work, with Rhenko keeping a share. Creator subscriptions are not built; the plan is in `docs/creator-subscriptions.md`. | Tips: works now. Creator subscriptions: not built. | Tips: `e2e/billing.mjs` (a tip goes through checkout, Rhenko's share is kept, and a repeated webhook changes nothing). |
| Gifting subscriptions | Premium | Not offered | Not built | Not built | None |
| ID verification label | Premium | Not offered. Plus does not check identity. | Not built | Deliberately not offered | None |
| Media Studio | Premium | Not offered | Not built | Not built | None |
| Higher Grok limits | Premium | Not offered. Rhenko has no paid AI tier. | Not built | Deliberately not offered | None |
| Radar Search, X Pro | Premium+ | Not offered | Not built | Not built | None |
| Business and Organizations accounts | Separate account types on X | Not offered | Advertising accounts (`/advertise`) are a separate thing, not a business tier for the person's account | Not built | None |

## Where Rhenko is smaller, and why

- **Video length.** Rhenko's Plus limit is 10 minutes, and X's Basic limit is about 3 hours. The size limit is 100 MB for everyone,
  so a 10-minute video at phone quality will usually be too large to post whole. A Plus account has to trim it or reduce its
  quality. This is stated on the Plus page.
- **Reply order and reach.** Rhenko does not sell reply boosts, and no ranking code reads the Plus flag. The only code that reads
  it is the video limit, the edit window, the animated picture check, and the ad filter.
- **No creator subscriptions, no gifting, no Media Studio.** These need decisions that have not been made.

## Known gaps

- **A lapsed Plus account keeps an animated picture it already set.** The rule is enforced when a picture is saved. Nothing
  converts the GIF to a still when Plus ends. This needs a product decision.
- **Animated banners are open to everyone.** The brief covered only profile pictures. The banner picker still turns a GIF into a
  still image, but the server accepts a GIF banner from anyone who sends one.
- **Chat videos use the same limit.** A direct message sent by a Plus account may run up to 10 minutes. The brief did not say
  whether chat should differ.
- **Trimmed Plus videos may time out.** A trimmed video is re-encoded, and a 10-minute cut can take longer than the 3-minute
  budget in `lib/video-metadata.ts`. Such a cut is refused with a message asking for a shorter part. This was not measured on the
  production server.
