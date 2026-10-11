# Rhenko

A public-conversation app in the shape of X. Black and white by default, with a dusk accent (`#4b3f72` in light mode, `#b3a4e8` in dark) and Sora type. It runs on Next.js 16 (App Router with Cache Components), React 19, Tailwind v4, and the component set in `components/ui`.

## Run it

```bash
npm install
npm run dev          # development server on http://localhost:3000
```

For production:

```bash
npm run build
npm start -- -p 3100 # serves the built app on http://localhost:3100
```

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
- Sign up with a display name, handle, password and date of birth. Accounts under 13 are refused.
- Passwords are hashed with scrypt. Sessions are stored by SHA-256 token hash in an httpOnly cookie.
- Two-factor sign-in with an authenticator app (TOTP, RFC 6238). Ten one-time recovery codes are issued when it is turned on. Codes can be regenerated.
- Signed-in devices can be reviewed and revoked, individually or all but the current one.
- Change password, change handle, edit the birthday, deactivate the account (it can be reactivated by signing in again), or delete it.
- Export everything the account holds as JSON from Settings → Account.

**Home and posts**
- For you and Following feeds. Older posts load as you scroll, with a "Show more" button as a fallback.
- Posts up to 280 characters, with mentions, hashtags and links. Up to four images (JPEG, PNG, WebP, GIF, 4 MB each) or one video (MP4, WebM, MOV, 25 MB), with alt text.
- Polls with two to four options and a duration from 5 minutes to 7 days.
- Reply, quote, repost, like, bookmark, share, pin to your profile, and highlight.
- Undo: a new post can be taken back for 10 seconds, from the toast that confirms it.
- Thread composer: "Add to thread" sends the text as the first of a chain of replies and clears the box for the next part. "Post" sends the last part and ends the thread. "Finish thread" ends it early.
- Edit a post for 30 minutes after it's published. The "Edited" mark opens the post's edit history, with every earlier version.
- Reply settings: everyone, people you follow, or only people you mention.
- Drafts and scheduled posts (5 minutes to 75 days ahead), in the Drafts section.
- Hide a reply to your own post. Hidden replies disappear for everyone except the reply's writer and the post's author.
- Community notes: signed-in people can add one note to a post. It is shown once at least two people rate it helpful, and more of them than not.
- Share → Copy embed code gives a blockquote snippet for other sites.
- Sensitive-media flag, and report.
- Post view counts, shown on the Analytics page.

**Profiles and relationships**
- Posts, replies, media, likes (visible only to the account's owner) and highlights tabs.
- Follow, unfollow, and follow requests for protected accounts. Protected accounts show only to approved followers.
- Block and mute, with the expected visibility rules in both directions.
- Followers and following lists. Owners can remove a follower.
- Muted words hide matching posts from your feeds and search results.
- Post notifications: the bell on a profile you follow sends an alert for each new post from that account. It stops when you unfollow.

**Explore and search**
- Search posts and people with `from:handle`, `to:handle`, `since:YYYY-MM-DD`, `until:YYYY-MM-DD`, `filter:images|videos|media|links|replies`, `min_likes:N`, `min_reposts:N`, and `-word` to leave a word out.
- Recent searches (the last 15) appear on the search page. Remove them one at a time or clear them all.
- Trending hashtags, topics you follow (`/topics/[tag]`), and suggested people.

**Notifications**
- Likes, reposts, replies, quotes, follows, mentions, poll results, follow requests, and new posts from accounts you've switched alerts on for. Each kind has an on/off switch in Settings → Notifications.
- Mentions can be limited to verified accounts in Settings → Notifications.

**Messages**
- Direct messages and group chats. Groups have a title, up to 50 people, and members can be added or leave.
- Message requests: someone you don't follow lands in Requests until you accept. Declining removes the conversation.
- Emoji reactions, deleting your own message for everyone, images, shared posts, typing indicators, and read receipts ("Seen").
- Mute a conversation from its header. A muted conversation doesn't count toward the unread total.

**Analytics**
- Owners get an Analytics page: post views and profile visits over the last 28 days, follower counts, a 14-day chart, and the top posts.
- A profile visit from the same person counts once every six hours. Visits from the owner don't count.

**Lists and communities**
- Lists with members, a public or private setting, and a timeline for each list. Private lists can't be followed.
- Communities: create one, join or leave, post inside it, and delete it as the owner.

**Bookmarks and drafts**
- Bookmarks can be sorted into folders. Deleting a folder keeps its bookmarks.

**Display and PWA**
- Light, dark, dim, lights out or system theme. Dim is a softer dark palette, and lights out is pure black.
- Default or large text, and a reduce-motion switch that turns off counters and movement. Both are saved on this device.
- Keyboard shortcuts, listed in Settings → Display.
- Installable as a PWA with an offline fallback page. The service worker only registers in production.

**Realtime**
- Open tabs receive new posts, notifications and messages through `/api/events` (server-sent events). The page refreshes after a short debounce.

## Known limits

- Realtime uses an in-process event bus. It works on one server; several instances would need a shared broker such as Redis.
- SQLite and local uploads assume one machine with a writable disk. They are not built for serverless hosting.
- No email verification and no password reset. Recovery relies on two-factor codes, so keep the recovery codes somewhere safe.
- No rate limiting on sign-in or posting yet.
- Not-found pages for missing accounts, posts, lists, communities and conversations return HTTP 200 with a `noindex` tag and the "This page is not here" view. Cache Components sends a static shell before the page runs, so the status is already fixed. Unknown URLs outside the app routes get a real 404.
- The likes tab shows only to the account's owner, matching X's default.
- Communities are deleted by their owner rather than handed over, and owners can't leave their own community.
- Not included: ads and ad billing, premium tiers and payments, tip jar, the AI assistant, Spaces, jobs, articles, live video, shopping, saved searches, and a lists tab in search.
