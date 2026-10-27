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
PORT=3100 npm start  # serves the built app on http://localhost:3100
```

`npm start` runs `server.mjs`, which starts several worker processes on the one port (see `RHENKO_WORKERS` below). They share their state through the database, so any of them can serve any request, and a worker that stops is replaced.

For local development, `npm run dev` needs a Postgres database (see `DATABASE_URL` below). Set `RHENKO_STORAGE=local` to keep uploads in `data/uploads/` instead of R2.

Production runs with Docker Compose: Postgres for the data, the app, Caddy for HTTPS, and database backups every six hours, copied to Cloudflare R2.

On a new Ubuntu 24.04 server, clone the repository and run the bootstrap script as root. It installs Docker, opens only SSH, HTTP and HTTPS, adds swap, turns on security updates, asks for the domain and the R2 settings, generates the passwords and server key on the server, and starts the stack:

```bash
git clone https://github.com/maan-oss/Rhenko.git rhenko && cd rhenko
sudo sh deploy/bootstrap.sh
```

Point the domain's DNS record at the server before or just after it runs. Caddy gets the HTTPS certificate once the name resolves.

To run the stack by hand instead, set `RHENKO_DOMAIN`, `POSTGRES_PASSWORD`, `RHENKO_SECRET` and the `RHENKO_R2_*` settings in `.env`, then:

```bash
cp .env.example .env   # then fill in the settings above
docker compose up -d --build
```

The Sora font is served from the app (`app/fonts/`, under the SIL Open Font License), so the build needs no network access beyond installing packages.

## Configure

Every setting is optional. `.env.example` lists them, and a line that starts with `#` is off.

- `DATABASE_URL` points the app at Postgres (version 16 or later; the Compose file runs 17). It must be a direct connection or a session-mode pooler, not a transaction-mode one, because live events use `LISTEN`.
- `RHENKO_STORAGE` chooses where uploads go: `r2` with the `RHENKO_R2_ENDPOINT`, `RHENKO_R2_BUCKET`, `RHENKO_R2_ACCESS_KEY_ID` and `RHENKO_R2_SECRET_ACCESS_KEY` settings for production, or `local` for development. Without it the app looks for Supabase settings instead.
- `RHENKO_PUBLIC_URL` is the address people use, with `https`. Passkeys and Stripe checkout links are built from it.
- `RHENKO_SECRET` (16 characters or more) is required. It keys the encryption of stored two-factor keys and codes, and the server refuses to use them without it. Keep a copy: losing or changing it makes the stored two-factor keys unreadable (recovery codes still work).
- `RHENKO_SMTP_URL` and `RHENKO_MAIL_FROM` send the email codes for address confirmation and password reset. In production, without SMTP, those features say email isn't set up.
- `RHENKO_TRANSLATE_URL`, and `RHENKO_TRANSLATE_KEY` if that service needs one, turn on the translate button through a LibreTranslate-compatible service. Off by default, and only the text a reader asks to translate is sent.
- `RHENKO_SARVAM_KEY` turns on Sahayak, the AI account that answers a mention of `@sahayak` under a post. It uses Sarvam AI (`RHENKO_SARVAM_URL` and `RHENKO_SARVAM_MODEL` can point it elsewhere). Off by default. When on, only the question and the posts it replies to or quotes that the asker can see are sent, and Sahayak labels its posts and profile as AI.
- `RHENKO_TRUST_PROXY=1` when a reverse proxy sets `X-Forwarded-For` or `X-Real-IP`. Without it, every visitor shares one rate-limit bucket, and the checks that count accounts by network are off.
- `RHENKO_TURNSTILE_SITE_KEY` and `RHENKO_TURNSTILE_SECRET_KEY`, set together, use Cloudflare Turnstile for the human check on sign-up, sign-in, password resets, and new follows, messages and posts from accounts that look automated. Without them the check is a puzzle that runs in the visitor's browser, and nothing is sent to a third party.
- `RHENKO_PROOF_BITS` sets how hard the built-in puzzle is, from 8 to 22 zero bits (default 16). The end-to-end suite sets it to 8 so each sign-up is quick.
- `RHENKO_ICE_SERVERS`, or `RHENKO_TURN_SECRET` with `RHENKO_TURN_URLS`, give voice calls a TURN relay for networks that block direct connections. Without them calls use Google's public STUN server.
- `RHENKO_OPERATOR_NAME` and `RHENKO_CONTACT_EMAIL` appear on the Terms and Privacy pages.
- `RHENKO_DATA_DIR` moves the data folder (default `./data`), which, with `RHENKO_STORAGE=local`, holds the uploads. `PORT` sets the port for `npm start`; Compose serves ports 80 and 443 through Caddy.
- `RHENKO_WORKERS` sets how many worker processes serve the app (default 4, or the number of CPUs when there are fewer). `RHENKO_HOST` sets the address they listen on (default `0.0.0.0`).

Production needs HTTPS: the sign-in cookie is marked Secure, and voice calls need a secure page.

## Data

- Everything is in Postgres. The schema is `db/postgres/schema.sql`. It creates the tables when a database starts empty, and it is not re-runnable, so an existing database is upgraded with the SQL its release notes give, not by running the file again.
- Uploads (avatars, banners, post images and videos, chat photos) get random names. They are stored in the R2 bucket with `RHENKO_STORAGE=r2`, or in `data/uploads/` with `local`. `/media/[file]` checks who may see a file, then sends the viewer to a link to it that lasts an hour.
- Photos lose their location, camera and time details when they are uploaded. That covers EXIF, XMP, IPTC, text chunks and comments in JPEG, PNG, WebP and GIF. The picture itself is unchanged. Videos keep their metadata.
- With Compose, the `backup` service writes a `pg_dump` every six hours and keeps the newest 16 (four days). The `backup-upload` service copies them to the R2 bucket, under `db-backups/`, every hour. The uploads are already in R2, and the server key is not in the dumps, so keep `RHENKO_SECRET` (or `data/secret.key`) somewhere safe too.
- To restore a dump: `pg_restore --no-owner --clean --if-exists --dbname "$DATABASE_URL" rhenko-<time>.dump`. Stop the app first.
- A background tick runs every 15 seconds. It publishes scheduled posts on time, announces poll results, ends calls that have stopped answering, and removes expired sessions and codes.
- Retention is enforced by the background tick: views and profile visits after 90 days, For you impressions and time on screen after 30 days, read notifications after 180 days, notices and moderation records after three years, and "Not now" choices on connection suggestions after 180 days. Hidden posts are deleted when their appeal window closes or an appeal fails.
- To start an install over, run `docker compose down`, then remove the Postgres volume (the one ending in `_pgdata`, listed by `docker volume ls`). The uploads in R2 stay until they are removed from the bucket.

## Operations

```bash
docker compose exec backup sh /backup.sh once          # write a database dump now
docker compose logs -f backup-upload                    # see whether dumps reach R2
```

The upload job removes dumps under `db-backups/` that are older than `BACKUP_KEEP_DAYS` (30 by default), so nothing needs setting in the Cloudflare dashboard. Dumps that the upload job has not removed yet still hold deleted content, as `docs/legal-operations.md` says.

The moderation, legal and grant commands below run on the server with `docker compose exec app` in front of them, for example `docker compose exec app node scripts/moderation.mjs list`. Without Docker, use `npm run` as shown.

```bash
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

`npm run test:e2e` drives a real Chromium through the whole product against a server that is already running. It creates its own accounts for each run, on desktop and phone sizes. Start the server with `RHENKO_TRUST_PROXY=1` and `RHENKO_PROOF_BITS=8`. Settings the suite reads from the environment are `BASE_URL`, `CHROMIUM_PATH`, `SERVER_LOG` (the server's output, for codes it prints), `MAIL_LOG` (the log of a local mail sink when the server sends through SMTP), `RHENKO_DATA_DIR` and `ONLY` (for example `ONLY=auth,posts`). The header of `e2e/run.mjs` has the full list.

## What's in it

**Accounts and security**
- Sign up with a display name, handle, date of birth and password. The handle is `@` followed by 3 to 15 letters, numbers or underscores, with at least 3 letters and at most 5 underscores. Anything that breaks a rule turns red as you type. Accounts under 18 are refused. Sign-up ends with a box to agree to the Terms and Privacy Policy, and an account must agree again whenever they change.
- The date of birth is picked from a round calendar that opens under the field.
- Email is optional at sign-up. Add an address in Settings → Account and confirm it with the six-digit code that is mailed. Forgot your password? A code goes to the confirmed address. Setting a new password signs out every device, this one included.
- Passwords are hashed with scrypt. Sessions are stored by SHA-256 token hash in an httpOnly cookie. New accounts land on home.
- Two-factor sign-in with an authenticator app (TOTP, RFC 6238). Ten one-time recovery codes are issued when it is turned on. Codes can be regenerated. Each code works once.
- Passkeys and security keys (WebAuthn), added under Settings → Security, up to ten per account. A passkey signs in from the login page with no password, once the device has checked the person (fingerprint, face or PIN). A passkey or a security key can also stand in for the authenticator code as the second step after a password. Removing a key stops it working at once.
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
- The composer posts text up to 25,000 characters, up to four images (JPEG, PNG, WebP, GIF, 4 MB each) or one video (MP4, WebM, MOV, up to 100 MB and 140 seconds) with alt text, or a poll with two to four options. A video over 140 seconds opens a trim sheet, and Trim is on any video. The server makes the cut.
- Articles: the article button in the composer adds a title (up to 120 characters) and a longer body (up to 50,000 characters). The title heads the post in feeds and on its own page, and it can be changed while the post is still editable. An article can carry photos or a video, and it can be drafted or scheduled. It can't be a poll, a thread, a reply or a quote.
- Stickers: a photo can carry emoji (from the Twemoji set, credited in the tray) and short text stickers, up to 40 characters in three styles. Stickers are placed from the photo itself, so they stay on the same part of the picture in the feed, on the post page and in the composer. They can be dragged, or moved, resized and turned from the keyboard. A photo carries up to 12 stickers, and a video does not take them.
- Long posts fold after their opening lines, with Show more and Show less. Posts can use **bold**, *italic* and ~~strike~~. A mark must touch its text, so "2 * 3 * 4" stays as written.
- Threads: Add to thread adds another part under the first post. The parts post in order, each answering the one before, and a later part links back with Show this thread. Threads post right away, so they can't be drafted or scheduled.
- The first link in a post shows a card with the page's title and description. The server reads each page once, refuses private and local addresses, and connects only to the address it checked.
- Under the text, on one row to the left of Save draft and Post, are icon buttons for photos, poll, add to thread, emoji and schedule. The row stays on one line from 360 pixels wide up, with slightly smaller icons below 430 pixels. While a post sends or is scheduled, the phone button shows an icon in place of its words. A "Who can reply" pill sits at the top right of the composer. It shows the current choice (everyone, accounts you follow, or accounts you mention), and opens an animated card with the three choices and a Done button. A "Mark media as sensitive" toggle appears when it applies. Replies inherit the post's settings.
- Schedule picks a date and a quarter-hour time. The server checks the time is far enough ahead and reports a problem as a toast. Scheduled posts go live within 15 seconds of their time.
- Save draft keeps a new post on `/drafts` without publishing it. Cmd or Ctrl with Enter posts.
- Posts with two or more photos or videos show as a carousel. Hover the post for the arrows, use the arrow keys once it has focus, swipe on a phone, or pick a dot.
- Feeds load older posts as you scroll, with a "Show more" button as a fallback.
- Reply, quote, repost, like, bookmark, share, pin to your profile, and highlight.
- Undo: a new post can be taken back for 10 seconds, from the toast that confirms it.
- Edit a post for 60 minutes after it's published (a Plus account gets 24 hours), and a reply for 5 minutes. The "Edited" mark opens the post's edit history.
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
- Cashtags: `$AAPL` (a `$` and 1 to 10 letters, never `$5`) links to `/topics/%24AAPL`, separate from `#aapl`; follow, snooze, Trending (with the `$`), composer suggestions.

**Notifications**
- Likes, reposts, replies, quotes, follows, mentions, poll results, follow requests, and new posts from accounts you've switched alerts on for. Each kind has an on/off switch in Settings → Notifications.
- Mentions can be limited to verified accounts in Settings → Notifications.
- Each row shows the kind of notification as a small badge on the avatar, with the time under the name and a preview of the post when there is one. Unread rows are shaded and carry a dot.
- The tabs show an icon, and the active one also shows its name. The solid fill slides to the one you pick.
- Push: Settings → Notifications → Turn on push on this device. Kind switches, mutes and blocks apply. A push says who and what, and message words appear only with "Show message previews" (off by default).
- Email digest: off by default. Settings → Notifications → Email me a daily digest sends one email a day with counts and the latest notifications. It has one unsubscribe link that works signed out. Message words appear only with "Show message previews".

**Messages**
- Direct messages and group chats. Groups have a title, up to 50 people, and members can be added or leave. Anyone who doesn't follow the creator gets an invite and joins once they accept.
- Message requests: someone you don't follow lands in Requests until you accept. Declining removes the conversation.
- Emoji reactions, deleting your own message for everyone, photos, shared posts, dictation where the browser supports it, typing indicators, and read receipts ("Seen").
- Attachments: photos, scans, videos, documents, audio files, voice messages, contacts, locations and polls. A poll has two to twelve choices and can allow more than one answer; its votes show as counts, never who chose what, and each person can change or take back their vote. A link in a text message shows the page's preview, as it does in posts.
- Voice messages. The microphone button records up to two minutes. The recording is previewed, and can be discarded, before it is sent. Both people can play it.
- Mute a conversation from its header. A muted conversation doesn't count toward the unread total and doesn't send banners or pushes. The exception is a mention: in a group, type @ and a name to pick someone, and a member who is mentioned is told ("Mentioned you") even when the group is muted. A forwarded message doesn't mention anyone.
- Chat list: each chat has an options menu beside it. Pin up to three chats to the top, or archive one. An archived chat waits under Archived (1) above the list, and a new message from someone else brings it back.
- Star a message from its ⋯ menu. Starred messages are listed under the star button in Messages, and only the person who starred them sees the list. View-once photos can't be starred.
- Forward a message to up to five chats from its ⋯ menu. The copy keeps its text, photo, file, place, contact or shared post and says it was forwarded. Polls, calls, view-once photos and changes to the timer can't be forwarded.
- Edit the words of a message you sent from its ⋯ menu, for 15 minutes after it was sent. An edited message says "Edited". Polls, contacts, places, calls, view-once photos and changes to the timer can't be edited. A message with a file keeps the file and can have its caption changed.
- Search this chat from the ⋯ menu in the header. It finds words in the messages here, your own and theirs, newest first. Choosing a result opens the thread at that message, with the messages after it; "Jump to the latest messages" returns to the end.
- View once: switch on "View once" before sending a photo or video. Each other person in the chat can open it once, and it then shows "Opened". The sender always sees it. It can't be starred, forwarded or sent as a scan.
- Chat wallpaper: choose Default, Dusk, Paper, Mist or Ink from the chat's ⋯ menu. Only you see it, and the other people in the chat keep theirs.
- Delete for me removes a message from your own view only. Everyone else keeps it.
- Clear chat, from the header's ⋯ menu, empties your copy of the chat: the messages sent so far disappear for you only, and new messages still show. The chat's list preview goes with them.
- Jump to a date, from the header's ⋯ menu, opens the chat at the first message sent on or after the day picked. A date with nothing after it says so.
- Message info, from the ⋯ menu on your own message, lists who in the chat has seen it. It shows whether each person has seen it, not when.
- Favourite a chat from its ⋯ menu in the chats list. Favourites have a tab of their own, and a favourite stays in the chats list too.
- Pin a message from its ⋯ menu. A pinned message shows at the top of the chat for everyone in it, and opening it jumps to the message. A chat holds three pins at most; anyone in the chat can unpin.
- Select messages from a message's ⋯ menu, then tap more to pick others. The bar at the bottom can star them or delete them for you only. Forwarding a selection is not supported.
- Remind me, from a message's ⋯ menu, sends you that message again at a time you pick: in an hour, this evening, tomorrow morning, or any time within a year. You get a banner and a push, once. Cancel it from the same menu.
- Contact info, from the header's ⋯ menu, lists the people in the chat, what has been shared in it (photos and videos, files, links, your starred messages), and how its notifications reach you. Notifications can be set to all messages, to mentions only, or to nothing. A mention still reaches a muted chat unless you choose nothing.
- Export chat, from the header's ⋯ menu, saves the chat as a text file: one line per message, in UTC. Photos, videos and voice notes are listed by name, not included. An export is limited to five an hour, and a very long chat is cut at its most recent 20,000 messages.
- Voice calls. Start a call from a conversation's header, one to one or with a group. The others get a ring, and a Join banner reaches anyone who opens the app during the call. Anyone can mute their own microphone, leave, or come back. A call with no one left ends, and the conversation keeps a record of it. A group call holds up to six people. Members who muted the conversation are not rung. Calls need the microphone, and a secure page.
- Video calls, one to one. The video button sits beside the call button. The person called sees "Incoming video call" and answers with their camera, or without one if the camera is refused. Camera off hides this side's picture and keeps the call going. Group calls are voice only.
- Group info shows the members. Any member can rename the group. Only the person who made it can remove someone, and every member can leave.
- Disappearing messages: set from the header (off, 24 hours, 7 days, 30 days). Applies to new messages; each is gone for everyone once its time runs out.
- Group invite links: any member can make, reset or turn one off in Group info. People join without approval, up to 50.
- Screen sharing, one to one: Share screen replaces your camera, or adds a picture to a voice call. The other person sees it whole, labelled Sharing screen. Hidden where the browser can't share.

**Analytics**
- Owners get an Analytics page: post views and profile visits over the last 28 days, follower counts, a 14-day chart, and the top posts.
- A profile visit from the same person counts once every six hours. Visits from the owner don't count.
- Post analytics: the author sees one post's views, engagement rate (likes, reposts, quotes, replies and bookmarks as a share of views), each action's count, and a 14-day chart. Other people get the same "This page is not here" page as for a post that doesn't exist. Drafts and scheduled posts have no analytics until they go out.

**Lists**
- Lists with members, a public or private setting, and a timeline for each list. Private lists can't be followed, and anyone else sees the same "This page is not here" page as for a list that doesn't exist.

**Circles**
- A circle is a small group with a name, a one-line tagline, and a charter of its own rules, which people read before they join. Each circle is open (anyone can join), ask to join (applicants answer the circle's question, and the owner approves or declines each one), or invite only (the owner adds people by handle).
- Posts made in a circle carry its name. An invite-only circle's posts, replies and charter are shown only to its members, and stay out of For you, search, and direct links for everyone else.
- The owner manages the circle from its Settings tab: the charter, access, the question, the requests, and deletion. Deleting an open circle keeps its posts as ordinary posts. Deleting an invite-only circle deletes its posts, because only its members could see them. When an account is deleted, its circles pass to the member who joined first, or close if nobody else is in them.

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

- The Compose file runs one app container with several worker processes. Live events, call state, rate-limit counters and the background-work lease are in Postgres, so more app servers can share the database and the bucket. That has not been run with more than one server yet. Before adding a second, set the same `RHENKO_BOOT_ID` on every server: each server otherwise sends its own boot id, and a tab that reconnects to another server clears any call in progress.
- A restart of the server reloads open tabs, so any call in progress ends.
- A signed-out session, or a profile change, can take up to 10 seconds to take effect on another server, because each server keeps a session's viewer for that long.
- Local uploads (`RHENKO_STORAGE=local`) live on one machine's disk. They are for development. Production uses R2.
- A page that doesn't exist, or that the viewer may not see, answers HTTP 200 with the "This page is not here" view and a `noindex` tag. Cache Components sends the page shell before the page's checks run, so the status can't change. The app is behind sign-in, so search engines see only the sign-in, terms and privacy pages. A path with no matching route at all, such as `/nope/a/b`, gets a real 404. A single unknown name is read as a handle, so it gets the same "not here" view as any missing profile.
- Messages are stored as readable text on the server. They are not end-to-end encrypted.
- A view-once photo or video is shown once in the app, but a recipient who has opened it can still fetch the file by its address, because video plays by asking for it in parts. It is not protected against saving or screenshots.
- Chat search finds words in message text and captions, not in file names. A search result opens the thread from that message onward, up to 500 messages; "Jump to the latest messages" covers the rest.
- Actions that change an account, a setting, a passkey or content check the agreement to the Terms. Signing in, signing out, accepting the Terms, and deactivating or deleting an account do not require it.
- Videos are rewritten with ffmpeg on upload, which must be installed. Older videos keep their metadata.
- Voice calls use Google's public STUN server unless `RHENKO_ICE_SERVERS` or the TURN settings are set. Some networks only connect through TURN. Video calls are one to one, and a group call is voice only and holds up to six people.
- Link previews show the page's title and description only. Images from the page are not copied to the server.
- Email codes need SMTP. Without it, in production, the email features say they are not set up.
- Scheduled posts are published by the 15-second tick, so a post can be up to 15 seconds late.
- The likes tab shows only to the account's owner, matching X's default.
- Home has two tabs, For you and Following. Lists and timelines are reached from the plus button, not pinned as tabs. Circles have their own page in the navigation, and a post is put in a circle from the composer on Home or from the circle itself. Drafts and scheduled posts are reached from the Drafts icon.
- Passkeys need the address people use set in `RHENKO_PUBLIC_URL`. Without it the server reads the address from each request, so a passkey made on one address will not work on another.
- The 140-second video limit is checked in the browser when a video is picked, and on the server for every video: a trimmed video is cut to the window, and an untrimmed one over the limit is refused.
- Server actions accept request bodies up to 110 MB (`next.config.ts`), so a video can be sent to any of them. The body is read whole before the server checks it.
- Push needs `RHENKO_VAPID_PUBLIC_KEY`, `RHENKO_VAPID_PRIVATE_KEY` and `RHENKO_VAPID_SUBJECT`. Development has no service worker, so push can't be turned on there.
- Screen sharing is one to one and has no sound. Group calls stay voice only.
- The digest needs SMTP, `RHENKO_PUBLIC_URL` and `RHENKO_SECRET`. Its hour is UTC, because no time zone is stored. It sends up to `RHENKO_DIGEST_PER_PASS` emails per pass (default 25, at most 200).
- Not included: Spaces, jobs, live video, shopping, GIF search, and the News, Sports and Entertainment tabs in Explore. GIF search needs a GIF provider, the news tabs need a curated source, and the rest need their own product, realtime or safety work before they can be offered safely here.
