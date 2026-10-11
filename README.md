# Rhenko

A public-conversation app in the shape of X, built with its own look. Two themes only: light is Claude's cream, dark is ChatGPT's charcoal. Ink is the only accent. The type is Sora. It runs on Next.js 16 (App Router with Cache Components), React 19, Tailwind v4, and the component set in `components/ui`.

## Run it

```bash
npm install
npm run dev          # development server on http://localhost:3000
```

For production:

```bash
npm run build        # Turbopack build
npm start -- -p 3100 # serves the built app on http://localhost:3100
```

If `npm run build` fails on a machine where Turbopack can't load the Google font, build with webpack instead: `npx next build --webpack`. Both build the same app and both use the Tailwind PostCSS config in `postcss.config.mjs`.

## Data

- Storage is one SQLite file, `data/rhenko.sqlite`, using Node's built-in `node:sqlite`. It runs in WAL mode with foreign keys on. Schema changes are versioned migrations in `lib/db.ts`.
- Uploads (avatars, banners, post images and videos) are saved to `data/uploads/` under random names and served from `/media/[file]` with byte-range support.
- Set `RHENKO_DATA_DIR` to keep the database and uploads somewhere else.
- Delete the data directory to reset the app to empty.

## Verification

Badges can't be requested in the app. An operator grants them from the command line:

```bash
node scripts/grant-verified.mjs <handle>            # grant the badge
node scripts/grant-verified.mjs <handle> --revoke   # remove it
```

The script reads the same database as the app (`RHENKO_DATA_DIR`, or `./data`), and the server can keep running while it does.

## What's in it

**Accounts and security**
- Sign up with a display name, handle, date of birth and password. The handle is `@` followed by 3 to 15 letters, numbers or underscores, with at least 3 letters and at most 5 underscores. Anything that breaks a rule turns red as you type. Accounts under 13 are refused.
- The date of birth is picked from a round calendar that opens under the field.
- Passwords are hashed with scrypt. Sessions are stored by SHA-256 token hash in an httpOnly cookie. New accounts land on home.
- Two-factor sign-in with an authenticator app (TOTP, RFC 6238). Ten one-time recovery codes are issued when it is turned on. Codes can be regenerated.
- Signed-in devices can be reviewed and revoked, individually or all but the current one.
- Change password, change handle, edit the birthday, deactivate the account (signing in again reactivates it), or delete it.
- Export everything the account holds as JSON from Settings → Account.

**Status**
- A one-line status (up to 40 characters) set in Settings. It shows beside your name in the sidebar and as a pill on your profile.

**Home and posts**
- The top bar has Home, For you and Following, and a plus button for lists and timelines.
- The composer posts text, up to four images (JPEG, PNG, WebP, GIF, 4 MB each) or one video (MP4, WebM, MOV, 25 MB) with alt text, or a poll with two to four options. That is all it does.
- Feeds load older posts as you scroll, with a "Show more" button as a fallback.
- Reply, quote, repost, like, bookmark, share, pin to your profile, and highlight.
- Undo: a new post can be taken back for 10 seconds, from the toast that confirms it.
- Edit a post for 30 minutes after it's published. The "Edited" mark opens the post's edit history.
- Hide a reply to your own post. Hidden replies disappear for everyone except the reply's writer and the post's author.
- Community notes: signed-in people can add one note to a post. It is shown once at least two people rate it helpful, and more of them than not.
- Share → Copy embed code gives a blockquote snippet for other sites.
- Sensitive-media flag, and report.
- Post view counts, shown on the Analytics page.

**Profiles and relationships**
- A banner that fades into the page, a circle avatar, and Posts, Replies, Media, Likes (visible only to the account's owner) and Highlights tabs. Empty tabs say so in the middle of the page.
- Follow, unfollow, and follow requests for protected accounts. Protected accounts show only to approved followers.
- Block and mute, with the expected visibility rules in both directions.
- Followers and following lists. Owners can remove a follower.
- Muted words hide matching posts from your feeds and search results.
- Post notifications: the bell on a profile you follow sends an alert for each new post from that account. It stops when you unfollow.

**Explore and search**
- Explore is a search field, one icon button that switches between ranked posts (the default) and the latest, and a Media switch that shows only posts with photos or videos. Both controls live in the URL, so a view can be shared.
- The sidebar search is a circle that opens into a field on hover or focus, with recent searches listed under it.
- Search posts and people with `from:handle`, `to:handle`, `since:YYYY-MM-DD`, `until:YYYY-MM-DD`, `filter:images|videos|media|links|replies`, `min_likes:N`, `min_reposts:N`, and `-word` to leave a word out.
- The right rail shows trending hashtags, topics (`/topics/[tag]`) and suggested people.

**Notifications**
- Likes, reposts, replies, quotes, follows, mentions, poll results, follow requests, and new posts from accounts you've switched alerts on for. Each kind has an on/off switch in Settings → Notifications.
- Mentions can be limited to verified accounts in Settings → Notifications.
- The tabs slide between sections.

**Messages**
- Direct messages and group chats. Groups have a title, up to 50 people, and members can be added or leave.
- Message requests: someone you don't follow lands in Requests until you accept. Declining removes the conversation.
- Emoji reactions, deleting your own message for everyone, images, shared posts, typing indicators, and read receipts ("Seen").
- Mute a conversation from its header. A muted conversation doesn't count toward the unread total.
- The call button in a conversation's header is a placeholder. It says calls aren't live yet; no audio or video signalling runs in this build.

**Analytics**
- Owners get an Analytics page: post views and profile visits over the last 28 days, follower counts, a 14-day chart, and the top posts.
- A profile visit from the same person counts once every six hours. Visits from the owner don't count.

**Lists**
- Lists with members, a public or private setting, and a timeline for each list. Private lists can't be followed.

**Bookmarks**
- Bookmarks can be sorted into folders. Deleting a folder keeps its bookmarks.

**Settings**
- One page holds the status, Light and Dark appearance, the account pages (Account, Security, Privacy and safety, Notifications), the keyboard shortcuts, and a full-width Log out button that turns red on hover.
- The bottom-left account in the sidebar opens this page.
- The app follows the operating system's reduced-motion setting. There is no in-app switch.

**Display and PWA**
- Installable as a PWA with an offline fallback page. The service worker only registers in production.

**Realtime**
- Open tabs receive new posts, notifications and messages through `/api/events` (server-sent events). The page refreshes after a short debounce.

## Known limits

- Realtime uses an in-process event bus. It works on one server; several instances would need a shared broker such as Redis.
- SQLite and local uploads assume one machine with a writable disk. They are not built for serverless hosting.
- No email verification and no password reset. Recovery relies on two-factor codes, so keep the recovery codes somewhere safe.
- No rate limiting on sign-in or posting yet.
- Calls are not built. The call button is a placeholder.
- Communities were removed from the interface. Their database tables remain in place, unused, so existing data stays intact. Community notes on posts are still available.
- Drafts and scheduled posts are still stored by the server and their page still exists at `/drafts`, but the composer no longer creates them and the sidebar no longer links there.
- Not-found pages for missing accounts, posts, lists and conversations return HTTP 200 with a `noindex` tag and the "This page is not here" view. Cache Components sends a static shell before the page runs, so the status is already fixed. Unknown URLs outside the app routes get a real 404.
- The likes tab shows only to the account's owner, matching X's default.
- Not included: ads and ad billing, premium tiers and payments, tip jar, the AI assistant, Spaces, jobs, articles, live video, shopping, saved searches, and a lists tab in search.
