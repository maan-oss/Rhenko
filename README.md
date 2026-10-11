# Rhenko

A social app in the shape of X: posts, replies, quotes, reposts, likes, bookmarks, follows, notifications, direct messages, search and profiles. Built with Next.js 16 (App Router), React 19, Tailwind v4 and the Base UI component set in `components/ui`.

The component showcase lives at `/kit`.

## Run it

```bash
npm install
npm run dev          # development server on http://localhost:3000
```

For production:

```bash
npm run build
npm start            # serves the built app on http://localhost:3000
```

Use `npm start -- -p 3100` (or any port) to change the port.

## Data

- Storage is a single SQLite file, `data/rhenko.sqlite`, using Node's built-in `node:sqlite`. It runs in WAL mode with foreign keys on.
- Uploaded images (avatars, banners, post images) are saved to `data/uploads/` under random names. They are served from `/media/[file]`.
- Set `RHENKO_DATA_DIR` to store the database and uploads somewhere else.
- Delete `data/` to reset the app to empty.

## Features

- **Accounts:** sign up, log in, log out. Passwords are hashed with scrypt. Sessions last 30 days in an httpOnly cookie.
- **Home:** For you and Following feeds, with "Show older posts" paging.
- **Composer:** up to 280 characters, one image up to 4 MB, live character ring.
- **Posts:** reply, quote, repost, like, bookmark, share link, delete your own post (two-step confirm).
- **Profiles:** posts, replies and likes tabs, follow and unfollow, edit name, bio, location, website, avatar and banner.
- **Permalinks:** `/[handle]/status/[postId]` with the reply thread.
- **Explore:** search posts, people and hashtags. Trending hashtags in the right rail.
- **Notifications:** likes, reposts, replies, quotes, follows and mentions.
- **Messages:** inbox, one-to-one threads and new conversations. Updates by polling.
- **Settings:** light, dark or system theme, profile editing, log out.
- **Motion:** heart burst, animated counts, blur-in feed entries, sliding tab and nav indicators, intro on the auth pages. All of it respects `prefers-reduced-motion`.

## Known limits

- SQLite and local uploads mean one server. This does not scale across instances.
- No email verification and no password reset.
- No rate limiting on login.
- Notifications and messages refresh by polling every 8 to 15 seconds, not in real time.
- Unknown profile pages return HTTP 200 with a "not found" view, because the page streams.
- Feeds page with "Show older posts" links, not infinite scroll.
