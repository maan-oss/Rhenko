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

Or with Docker, which keeps the data and the backups in folders on the host:

```bash
cp .env.example .env   # optional: edit the settings you need
docker compose up -d --build
```

The build downloads the Sora font from Google Fonts, so it needs network access. If `npm run build` fails because Turbopack can't load that font, build with `npx next build --webpack`.

## Configure

Every setting is optional. `.env.example` lists them, and a line that starts with `#` is off.

- `RHENKO_SECRET` (16 characters or more) protects the stored two-factor keys. Without it the server makes `data/secret.key` on first use.
- `RHENKO_SMTP_URL` and `RHENKO_MAIL_FROM` send the email codes for address confirmation and password reset. In production, without SMTP, those features say email isn't set up.
- `RHENKO_TRANSLATE_URL`, and `RHENKO_TRANSLATE_KEY` if that service needs one, turn on the translate button through a LibreTranslate-compatible service. Off by default, and only the text a reader asks to translate is sent.
- `RHENKO_TRUST_PROXY=1` when a reverse proxy sets `X-Forwarded-For`. Without it, every visitor shares one rate-limit bucket.
- `RHENKO_ICE_SERVERS`, or `RHENKO_TURN_SECRET` with `RHENKO_TURN_URLS`, give voice calls a TURN relay for networks that block direct connections. Without them calls use Google's public STUN server.
- `RHENKO_OPERATOR_NAME` and `RHENKO_CONTACT_EMAIL` appear on the Terms and Privacy pages.
- `RHENKO_DATA_DIR` moves the data folder (default `./data`). `RHENKO_BACKUP_DIR` moves the backups (default `./backups`). `PORT` sets the port.

Production needs HTTPS: the sign-in cookie is marked Secure, and voice calls need a secure page.

## Data

- Storage is one SQLite file, `data/rhenko.sqlite`, using Node's built-in `node:sqlite`. It runs in WAL mode with foreign keys on. Schema changes are versioned migrations in `lib/db.ts`.
- Uploads (avatars, banners, post images and videos, chat photos) are saved under random names in `data/uploads/` and served from `/media/[file]` with byte-range support.
- Photos lose their location, camera and time details when they are uploaded. That covers EXIF, XMP, IPTC, text chunks and comments in JPEG, PNG, WebP and GIF. The picture itself is unchanged. Videos keep their metadata.
- `npm run backup` writes a folder into `backups/` with a consistent copy of the database, the server key and the uploads. It keeps the newest 14. Copy the backup folder off the machine as well. The script's header has the restore steps.
- A background tick runs every 15 seconds. It publishes scheduled posts on time, announces poll results, ends calls that have stopped answering, and removes expired sessions and codes.
- Retention is enforced by the background tick: views and profile visits after 90 days, For you impressions and time on screen after 30 days, read notifications after 180 days, notices and moderation records after three years, and "Not now" choices on connection suggestions after 180 days. Hidden posts are deleted when their appeal window closes or an appeal fails.
- Delete the data directory to reset the app to empty.

## Operations

```bash
npm run backup                          # back up now
npm run moderation -- list                              # open reports, oldest first
npm run moderation -- resolve <id>                      # close a report, leave the post
npm run moderation -- hide <postId> --category <id> --explain "<reason>"   # hide, tell the author, allow an appeal
npm run moderation -- restore <postId>                  # put a hidden post back
npm run moderation -- appeals                           # appeals waiting for a decision
npm run moderation -- decide <appealId> reverse|uphold --note "<reason>"
npm run moderation -- remove <postId>                   # delete a post for good at once (asks first)
npm run legal -- list                                   # notices about content, urgent first
npm run legal -- show <noticeId>
npm run legal -- decide <noticeId> actioned|rejected --note "<reason>"   # decides, and emails the sender
npm run legal -- record-request --summary "<text>"      # log an order from a court or authority
node scripts/grant-verified.mjs <handle>            # grant the verified badge
node scripts/grant-verified.mjs <handle> --revoke   # remove it
```

The scripts read the same database as the app, and the server can keep running while they do. The legal runbook in `docs/legal-operations.md` says when to use each command.

## Testing

`npm run test:e2e` drives a real Chromium through the whole product against a server that is already running. It creates its own accounts for each run, on desktop and phone sizes. Start the server with `RHENKO_TRUST_PROXY=1`. Settings the suite reads from the environment are `BASE_URL`, `CHROMIUM_PATH`, `SERVER_LOG` (the server's output, for codes it prints), `MAIL_LOG` (the log of a local mail sink when the server sends through SMTP), `RHENKO_DATA_DIR` and `ONLY` (for example `ONLY=auth,posts`). The header of `e2e/run.mjs` has the full list.

## What's in it

**Accounts and security**
- Sign up with a display name, handle, date of birth and password. The handle is `@` followed by 3 to 15 letters, numbers or underscores, with at least 3 letters and at most 5 underscores. Anything that breaks a rule turns red as you type. Accounts under 18 are refused. Sign-up ends with a box to agree to the Terms and Privacy Policy, and an account must agree again whenever they change.
- The date of birth is picked from a round calendar that opens under the field.
- Email is optional at sign-up. Add an address in Settings → Account and confirm it with the six-digit code that is mailed. Forgot your password? A code goes to the confirmed address. Setting a new password signs out every device, this one included.
- Passwords are hashed with scrypt. Sessions are stored by SHA-256 token hash in an httpOnly cookie. New accounts land on home.
- Two-factor sign-in with an authenticator app (TOTP, RFC 6238). Ten one-time recovery codes are issued when it is turned on. Codes can be regenerated. Each code works once.
- Signed-in devices can be reviewed and revoked, individually or all but the current one.
- Several accounts can be signed in on one device, up to five. The `…` button beside your name in the sidebar and the left panel lists them, switches between them, adds an existing account, and logs out the account you are using. When you log out, the next remembered account takes over.
- Change password, change handle, edit the birthday, deactivate the account (signing in again reactivates it), or delete it. Deleting removes the account's posts, messages and media for everyone.
- Export everything the account holds from Settings → Account. The export is a ZIP: `data.json` with the account's records, and a media folder with the files they point to.
- Sign-in, sign-up, password reset, email codes, two-factor codes, posting, uploads, calls and exports are rate limited per visitor and per account.

**Status**
- A one-line status (up to 40 characters) set in Settings. It shows beside your name in the sidebar and as a pill on your profile.

**Home and posts**
- The top bar has Home, For you and Following, a Drafts icon, and a plus button for lists and timelines. Trending topics are in the right-hand column and on Explore, and link to `/topics/[tag]`.
- Tabs show only their icon, except the active one, which also shows its name. Choosing a tab folds the old name back to its icon, then opens the new tab's name. The solid fill (black on a light page, white on a dark one) slides across to the chosen tab.
- The composer posts text up to 25,000 characters, up to four images (JPEG, PNG, WebP, GIF, 4 MB each) or one video (MP4, WebM, MOV, 25 MB) with alt text, or a poll with two to four options.
- Long posts fold after their opening lines, with Show more and Show less. Posts can use **bold**, *italic* and ~~strike~~. A mark must touch its text, so "2 * 3 * 4" stays as written.
- Threads: Add to thread adds another part under the first post. The parts post in order, each answering the one before, and a later part links back with Show this thread. Threads post right away, so they can't be drafted or scheduled.
- The first link in a post shows a card with the page's title and description. The server reads each page once, refuses private and local addresses, and connects only to the address it checked.
- Under the text, on one row to the left of Save draft and Post, are icon buttons for photos, poll, add to thread, emoji and schedule. The row stays on one line from 360 pixels wide up, with slightly smaller icons below 390 pixels. While a post sends or is scheduled, the phone button shows an icon in place of its words. A "Who can reply" pill sits at the top right of the composer. It shows the current choice (everyone, accounts you follow, or accounts you mention), and opens an animated card with the three choices and a Done button. A "Mark media as sensitive" toggle appears when it applies. Replies inherit the post's settings.
- Schedule picks a date and a quarter-hour time. The server checks the time is far enough ahead and reports a problem as a toast. Scheduled posts go live within 15 seconds of their time.
- Save draft keeps a new post on `/drafts` without publishing it. Cmd or Ctrl with Enter posts.
- Posts with two or more photos or videos show as a carousel. Hover the post for the arrows, use the arrow keys once it has focus, swipe on a phone, or pick a dot.
- Feeds load older posts as you scroll, with a "Show more" button as a fallback.
- Reply, quote, repost, like, bookmark, share, pin to your profile, and highlight.
- Undo: a new post can be taken back for 10 seconds, from the toast that confirms it.
- Edit a post for 60 minutes after it's published. The "Edited" mark opens the post's edit history.
- Hide a reply to your own post. Hidden replies disappear for everyone except the reply's writer and the post's author.
- Community notes: signed-in people can add one note to a post. It is shown once at least two people rate it helpful, and more of them than not.
- Share → Copy embed code gives a blockquote snippet for other sites.
- Sensitive-media flag, and report. Reports are reviewed with `npm run moderation`.
- Post view counts. The author's view count opens that post's analytics page.

**Profiles and relationships**
- A banner that fades into the page and a circle avatar. The tabs show only their icon, except the active one, which also shows its name. Each tab keeps its name for screen readers: Posts, Replies, Media, Reposts and Likes (visible only to the account's owner). Highlights sits inside Posts as a second option. Empty tabs say so in the middle of the page.
- Posts holds the account's own posts. Reposts have their own tab, so they no longer mix in with posts.
- A profile lists the people you follow who also follow it ("Followed by …"). The Message button sits below that line.
- Follow, unfollow, and follow requests for protected accounts. Protected accounts show only to approved followers.
- Block and mute, with the expected visibility rules in both directions. A blocked account's profile, posts and messages are hidden from the other person. For them it looks exactly like an account that doesn't exist.
- Followers and following lists. Owners can remove a follower.
- Muted words hide matching posts from your feeds and search results.
- Post notifications: the bell on a profile you follow sends an alert for each new post from that account. It stops when you unfollow.

**Explore and search**
- Explore is a search field, one icon button that switches between ranked posts (the default) and the latest, and a Media switch that shows only posts with photos or videos. Both controls live in the URL, so a view can be shared.
- The sidebar search is one surface. Clicking or focusing it grows the field into a card of recent searches, which fades in one row after another. The card sits over the nav without pushing it. Typing adds a "Search for" row, arrow down moves into the card, and Escape closes it.
- Search posts and people with `from:handle`, `to:handle`, `since:YYYY-MM-DD`, `until:YYYY-MM-DD`, `filter:images|videos|media|links|replies`, `min_likes:N`, `min_reposts:N`, and `-word` to leave a word out. Each search you run is kept as a recent search, and you can remove one or clear them all.
- The right rail shows trending hashtags, topics (`/topics/[tag]`) and suggested people.

**Notifications**
- Likes, reposts, replies, quotes, follows, mentions, poll results, follow requests, and new posts from accounts you've switched alerts on for. Each kind has an on/off switch in Settings → Notifications.
- Mentions can be limited to verified accounts in Settings → Notifications.
- Each row shows the kind of notification as a small badge on the avatar, with the time under the name and a preview of the post when there is one. Unread rows are shaded and carry a dot.
- The tabs show an icon, and the active one also shows its name. The solid fill slides to the one you pick.

**Messages**
- Direct messages and group chats. Groups have a title, up to 50 people, and members can be added or leave. Anyone who doesn't follow the creator gets an invite and joins once they accept.
- Message requests: someone you don't follow lands in Requests until you accept. Declining removes the conversation.
- Emoji reactions, deleting your own message for everyone, photos, shared posts, dictation where the browser supports it, typing indicators, and read receipts ("Seen").
- Voice messages. The microphone button records up to two minutes. The recording is previewed, and can be discarded, before it is sent. Both people can play it.
- Mute a conversation from its header. A muted conversation doesn't count toward the unread total and doesn't send banners.
- Voice calls. Start a call from a conversation's header, one to one or with a group. The others get a ring, and a Join banner reaches anyone who opens the app during the call. Anyone can mute their own microphone, leave, or come back. A call with no one left ends, and the conversation keeps a record of it. A group call holds up to six people. Members who muted the conversation are not rung. Calls need the microphone, and a secure page.
- Video calls, one to one. The video button sits beside the call button. The person called sees "Incoming video call" and answers with their camera, or without one if the camera is refused. Camera off hides this side's picture and keeps the call going. Group calls are voice only.
- Group info shows the members. Any member can rename the group. Only the person who made it can remove someone, and every member can leave.

**Analytics**
- Owners get an Analytics page: post views and profile visits over the last 28 days, follower counts, a 14-day chart, and the top posts.
- A profile visit from the same person counts once every six hours. Visits from the owner don't count.
- Post analytics: the author sees one post's views, engagement rate (likes, reposts, quotes, replies and bookmarks as a share of views), each action's count, and a 14-day chart. Other people get the same "This page is not here" page as for a post that doesn't exist. Drafts and scheduled posts have no analytics until they go out.

**Lists**
- Lists with members, a public or private setting, and a timeline for each list. Private lists can't be followed, and anyone else sees the same "This page is not here" page as for a list that doesn't exist.

**Bookmarks**
- Bookmarks can be sorted into folders. Deleting a folder keeps its bookmarks.

**Settings**
- One page holds the status, the appearance (Light and Dark, each a card with a small window preview), the account pages (Account, Security, Privacy and safety, Notifications), the keyboard shortcuts, the Terms and the Privacy policy, and a full-width Log out button that turns red on hover.
- Native controls such as checkboxes and sliders use the neutral gray, not the browser's blue.
- The gear at the top right of the sidebar (and of the left panel) opens this page. It sits in a pair with the sun/moon switch: click the pair to separate it, then the switch changes the theme and the gear opens Settings.
- The app follows the operating system's reduced-motion setting. There is no in-app switch.

**Display and PWA**
- The sidebar is one full-height, opaque surface. The logo leads at the top left. At the top right, the settings gear and the sun/moon switch sit as a pair, and a collapse button closes the sidebar (its arrow points left). Expanded, the labels show. Collapsed, the logo becomes the open button on hover (its arrow points right), and each icon's label appears beside it. The state is kept in a cookie, so the page never flashes the wrong width.
- The sidebar footer holds the Post button, then your profile, with the `…` account switcher and a log out button beside it. Post is always there, even when the sidebar is collapsed.
- The switch between light and dark sweeps a panel down the screen in the new colour, then the page converts underneath it. The pair squashes under the pointer and wobbles apart on a press.
- On phones the bottom navigation is a glass dock: Home, Explore, Notifications and Messages. The active item is a solid fill that slides between them. The avatar at the end opens the left panel, which holds every section. In a conversation the dock stays folded so the composer's Send button stays free, and tapping it opens the left panel.
- The left panel slides in from the left with rounded edges that overlap the page, and it is fully opaque. The logo leads at the top, the same settings and theme pair and a close button sit at the top right, then every section, with Post above your profile at the foot. Swipe right from the left edge to open it; swipe left, press Escape, or tap the dimmed page to close it.
- The sign-in art is liquid metal: a polished medallion carries the Rhenko mark, cut out of it, and droplets drift in and merge with it. The medallion swells toward the pointer, the light in the metal follows the pointer, and a click sends a ripple through it and throws droplets off that fall back in. The metal uses the theme's colours, and it holds still under reduced motion.
- The sign-in handle always shows its `@` in the normal text colour, and the Rhenko wordmark is the same size as the logo.
- Installable as a PWA with an offline fallback page. The service worker only registers in production.
- Security headers on every response: no sniffing, a strict referrer policy, a permissions policy that allows the microphone only for this site, frames refused, and HSTS in production.

**Realtime**
- Open tabs receive new posts, notifications, messages, banners and call events through `/api/events` (server-sent events). The page refreshes after a short debounce.

## Known limits

- One server process. Live events, call state and rate-limit counters are kept in memory, so a restart ends any call in progress and starts the rate-limit windows again. Several instances would need a shared store (for example Redis) first.
- SQLite and local uploads need one machine with a persistent disk. They are not built for serverless hosting.
- A page that doesn't exist, or that the viewer may not see, answers HTTP 200 with the "This page is not here" view and a `noindex` tag. Cache Components sends the page shell before the page's checks run, so the status can't change. The app is behind sign-in, so search engines see only the sign-in, terms and privacy pages. A path with no matching route at all, such as `/nope/a/b`, gets a real 404. A single unknown name is read as a handle, so it gets the same "not here" view as any missing profile.
- Messages are stored as readable text on the server. They are not end-to-end encrypted.
- The agreement to the Terms is enforced on every page. A request sent straight to a server action by an account that has not agreed is not refused yet: the actions check that someone is signed in, not that they agreed. Adding that check to each action is the next step.
- Videos keep their metadata. Only photos are cleaned on upload.
- Voice calls use Google's public STUN server unless `RHENKO_ICE_SERVERS` or the TURN settings are set. Some networks only connect through TURN. Video calls are one to one, and a group call is voice only and holds up to six people.
- Link previews show the page's title and description only. Images from the page are not copied to the server.
- Email codes need SMTP. Without it, in production, the email features say they are not set up.
- Scheduled posts are published by the 15-second tick, so a post can be up to 15 seconds late.
- The likes tab shows only to the account's owner, matching X's default.
- Home has two tabs, For you and Following. Lists and timelines are reached from the plus button, not pinned as tabs. Drafts and scheduled posts are reached from the Drafts icon.
- Not included: ads and ad billing, premium tiers and payments, tip jar, the AI assistant, Spaces, jobs, articles, live video and shopping. Each needs its own product, payment or safety work before it can be offered safely here.
