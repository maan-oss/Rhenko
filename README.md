# Rhenko

A public-conversation app in the shape of X, built with its own look. Two themes only: light is Claude's cream, dark is ChatGPT's charcoal. Ink is the only accent. Surfaces are glass (a translucent, blurred panel with a light top edge) and metal (a glossy ink fill on the active and primary controls). The type is Sora. It runs on Next.js 16 (App Router with Cache Components), React 19, Tailwind v4, and the component set in `components/ui`.

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
- The top bar has Home, For you and Following, a Drafts icon, and a plus button for lists and timelines. A row of trending topics sits above the composer and links to `/topics/[tag]`.
- Tabs across the app are icons. The active tab also shows its name, so you always know where you are.
- The composer posts text, up to four images (JPEG, PNG, WebP, GIF, 4 MB each) or one video (MP4, WebM, MOV, 25 MB) with alt text, or a poll with two to four options.
- Under the text are icon buttons for photos, poll, emoji and schedule. Below them, a "Who can reply" menu (everyone, accounts you follow, or accounts you mention) and a "Mark media as sensitive" toggle appear when they apply. Replies inherit the post's settings.
- Schedule picks a date and a quarter-hour time. The server checks the time is far enough ahead and reports a problem as a toast.
- Save draft keeps a new post on `/drafts` without publishing it. Cmd or Ctrl with Enter posts.
- Posts with two or more photos or videos show as a carousel. Hover the post for the arrows, use the arrow keys once it has focus, swipe on a phone, or pick a dot.
- Feeds load older posts as you scroll, with a "Show more" button as a fallback.
- Reply, quote, repost, like, bookmark, share, pin to your profile, and highlight.
- Undo: a new post can be taken back for 10 seconds, from the toast that confirms it.
- Edit a post for 30 minutes after it's published. The "Edited" mark opens the post's edit history.
- Hide a reply to your own post. Hidden replies disappear for everyone except the reply's writer and the post's author.
- Community notes: signed-in people can add one note to a post. It is shown once at least two people rate it helpful, and more of them than not.
- Share → Copy embed code gives a blockquote snippet for other sites.
- Sensitive-media flag, and report.
- Post view counts. The author's view count opens that post's analytics page.

**Profiles and relationships**
- A banner that fades into the page and a circle avatar. The tabs are icons, and the active one shows its name: Posts, Replies, Media, Reposts and Likes (visible only to the account's owner). Highlights sits inside Posts as a second option. Empty tabs say so in the middle of the page.
- Posts holds the account's own posts. Reposts have their own tab, so they no longer mix in with posts.
- A profile lists the people you follow who also follow it ("Followed by …"). The Message button sits below that line.
- Follow, unfollow, and follow requests for protected accounts. Protected accounts show only to approved followers.
- Block and mute, with the expected visibility rules in both directions.
- Followers and following lists. Owners can remove a follower.
- Muted words hide matching posts from your feeds and search results.
- Post notifications: the bell on a profile you follow sends an alert for each new post from that account. It stops when you unfollow.

**Explore and search**
- Explore is a search field, one icon button that switches between ranked posts (the default) and the latest, and a Media switch that shows only posts with photos or videos. Both controls live in the URL, so a view can be shared.
- The sidebar search is one surface. Clicking or focusing it grows the field into a card of recent searches, which fades in one row after another, the way the America.gov menu opens. The card sits over the nav without pushing it. Typing adds a "Search for" row, arrow down moves into the card, and Escape closes it.
- Search posts and people with `from:handle`, `to:handle`, `since:YYYY-MM-DD`, `until:YYYY-MM-DD`, `filter:images|videos|media|links|replies`, `min_likes:N`, `min_reposts:N`, and `-word` to leave a word out.
- The right rail shows trending hashtags, topics (`/topics/[tag]`) and suggested people.

**Notifications**
- Likes, reposts, replies, quotes, follows, mentions, poll results, follow requests, and new posts from accounts you've switched alerts on for. Each kind has an on/off switch in Settings → Notifications.
- Mentions can be limited to verified accounts in Settings → Notifications.
- Each row shows the kind of notification as a small badge on the avatar, with the time under the name and a preview of the post when there is one. Unread rows are shaded and carry a dot.
- The tabs are icons and slide between sections.

**Messages**
- Direct messages and group chats. Groups have a title, up to 50 people, and members can be added or leave.
- Message requests: someone you don't follow lands in Requests until you accept. Declining removes the conversation.
- Emoji reactions, deleting your own message for everyone, images, shared posts, typing indicators, and read receipts ("Seen").
- Mute a conversation from its header. A muted conversation doesn't count toward the unread total.
- The call button in a conversation's header is a placeholder. It says calls aren't live yet; no audio or video signalling runs in this build.

**Analytics**
- Owners get an Analytics page: post views and profile visits over the last 28 days, follower counts, a 14-day chart, and the top posts.
- A profile visit from the same person counts once every six hours. Visits from the owner don't count.
- Post analytics: the author sees one post's views, engagement rate (likes, reposts, quotes, replies and bookmarks as a share of views), each action's count, and a 14-day chart. Other people get a 404 for that page. Drafts and scheduled posts have no analytics until they go out.

**Lists**
- Lists with members, a public or private setting, and a timeline for each list. Private lists can't be followed.

**Bookmarks**
- Bookmarks can be sorted into folders. Deleting a folder keeps its bookmarks.

**Settings**
- One page holds the status, the appearance (Light and Dark, each a card with a small window preview), the account pages (Account, Security, Privacy and safety, Notifications), the keyboard shortcuts, and a full-width Log out button that turns red on hover.
- Native controls such as checkboxes and sliders use the neutral gray, not the browser's blue.
- The bottom-left account in the sidebar opens this page.
- The app follows the operating system's reduced-motion setting. There is no in-app switch.

**Display and PWA**
- The sidebar is one full-height surface. Expanded, a close button sits at the top right. Collapsed, the logo becomes the open button on hover, and each icon's label appears beside it. The state is kept in a cookie, so the page never flashes the wrong width.
- On phones the bottom navigation is a glass dock: Home, Explore, Notifications, Messages and Bookmarks. The active item is a metal pill that slides between them. The avatar at the end opens the left panel.
- The left panel slides in from the left with rounded edges that overlap the page. It holds your profile, every section, Drafts, Analytics, Settings and the Post button. Swipe right from the left edge to open it; swipe left, press Escape, or tap the dimmed page to close it.
- The sign-in screens show a faint, drifting ink mass around the Rhenko mark. It follows the pointer with a little lag and stays still under reduced motion.
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
- Drafts and scheduled posts live on `/drafts`. Scheduled posts go out when a feed is next read after their time, so a scheduled post can be late if nobody has opened the app since.
- Not-found pages for missing accounts, posts, lists and conversations return HTTP 200 with a `noindex` tag and the "This page is not here" view. Cache Components sends a static shell before the page runs, so the status is already fixed. Unknown URLs outside the app routes get a real 404.
- The likes tab shows only to the account's owner, matching X's default.
- Home has two tabs, For you and Following. Lists and timelines are reached from the plus button, not pinned as tabs. Drafts and scheduled posts are reached from the Drafts icon.
- Not included: ads and ad billing, premium tiers and payments, tip jar, the AI assistant, Spaces, jobs, articles, live video, shopping, saved searches, and a lists tab in search.
