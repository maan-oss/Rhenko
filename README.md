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
- Edit a post for 30 minutes after it's published; the post shows an "Edited" mark.
- Reply settings: everyone, people you follow, or only people you mention.
- Drafts and scheduled posts (5 minutes to 75 days ahead), in the Drafts section.
- Sensitive-media flag, and report.
- Post view counts.

**Profiles and relationships**
- Posts, replies, media, likes (visible only to the account's owner) and highlights tabs.
- Follow, unfollow, and follow requests for protected accounts. Protected accounts show only to approved followers.
- Block and mute, with the expected visibility rules in both directions.
- Followers and following lists. Owners can remove a follower.
- Muted words hide matching posts from your feeds and search results.

**Explore and search**
- Search posts and people, with `from:handle`, `since:YYYY-MM-DD`, `until:YYYY-MM-DD` and `filter:images|videos|media|links|replies`.
- Trending hashtags, topics you follow (`/topics/[tag]`), and suggested people.

**Notifications**
- Likes, reposts, replies, quotes, follows, mentions, poll results, and follow requests, with a per-kind on/off switch in Settings → Notifications.

**Messages**
- Direct messages and group chats. Groups have a title, up to 50 people, and members can be added or leave.
- Message requests: someone you don't follow lands in Requests until you accept. Declining removes the conversation.
- Emoji reactions, deleting your own message for everyone, images, shared posts, typing indicators, and read receipts ("Seen").

**Lists and communities**
- Lists with members, a public or private setting, and a timeline for each list. Private lists can't be followed.
- Communities: create one, join or leave, post inside it, and delete it as the owner.

**Bookmarks and drafts**
- Bookmarks can be sorted into folders. Deleting a folder keeps its bookmarks.

**Display and PWA**
- Light, dark or system theme, default or large text (saved on this device), and keyboard shortcuts (listed in Settings → Display).
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
- Not included: ads, premium tiers, AI assistants, Spaces, jobs, and analytics dashboards.
