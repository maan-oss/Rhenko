# Motion and interaction spec

This is the working reference for how Rhenko moves. The visual identity is fixed: monochrome, Sora, pill controls, hairline
borders. Motion exists to show cause and effect, where something came from, and what changed. It is not decoration.

## Motion classes

- **Feedback**: a direct answer to input. Press, hover, selecting a tab, toggling a switch. Shortest, quietest.
- **Spatial**: where a panel, sheet or menu came from and where it goes. Sheets rise from the bottom edge and close back
  down. Menus open from their trigger.
- **Continuity**: one surface that travels between choices. The selected tab's surface is a single shared element, so it
  slides from the old choice to the new one instead of fading out and in.
- **Narrative**: content that changes with scroll position. Used only on the marketing page, in pinned scenes.
- **Attention**: a meaningful update that needs noticing. Used rarely; never on a page that is only being read.

## Timing

Tokens live in `components/app/motion.ts`. Use them instead of literal numbers.

| Kind | Token | Value |
|---|---|---|
| Press | `DURATION.press` | 0.12s |
| Hover | `DURATION.hover` | 0.18s |
| Popover, dropdown | `DURATION.popover` | 0.24s |
| Small component | `DURATION.small` | 0.30s |
| Sheet or panel | `DURATION.sheet` | 0.40s |
| Whole view | `DURATION.view` | 0.45s |
| Selection surface | `SPRING_SELECT` | spring, stiffness 520, damping 42 |
| Bottom sheet | `SPRING_SHEET` | spring, stiffness 420, damping 42, mass 0.9 |

Easing is `EASE_OUT` (0.2, 0.7, 0.2, 1) for anything that enters or settles. No bounce, no overshoot. Springs are
critically damped or close to it.

## Rules

- One element leads a moment. Supporting elements follow only where they explain the change.
- Stable things stay still. A tab bar does not animate when the page under it loads.
- Press feedback is a short colour and surface change. Controls do not shrink on press.
- A selection surface moves between choices. It is never removed and re-added.
- Keyboard focus is shown with a visible ring (`focus-visible`), never by mouse or touch. Taps leave no outline.
- Touch targets are at least 44px (`tap-44`) on phones.
- Sheets can be dismissed by dragging the grab handle, by the scrim, or with Escape.
- Reduced motion: the OS setting is always respected. The root wraps the app in `MotionConfig reducedMotion="user"`, which
  stops movement and resizing. A global CSS rule shortens transitions to 1ms. Colour and opacity still change, so state
  is never carried by motion alone.
- Pinned scroll scenes are for the marketing page only. They are not used in the signed-in app, where scrolling must stay
  native and predictable. Every scene reads fully as static text when reduced motion is on.
- Never animate something only because it is visible. Entrance reveals are used once per section, never on every element.

## Implemented

- Shared motion tokens (`components/app/motion.ts`), used by the tab selection and the bottom sheet.
- The page tab bar (`TabLinks`) uses one sliding surface for its selected tab. It is used on home, search, bookmarks,
  notifications, drafts, circles, lists and people.
- Root reduced-motion handling (`components/app/motion-root.tsx`) around the whole app.
- The marketing site: transparent phone bar, tabbed features with a preview for each feature, a sticky-footer menu,
  no progress line, no search control, and a soft pressed state on the feed's ellipsis.
- Phone fit at 360px: the post action row is tighter on phones, and the composer's tool row wraps below 390px, which
  removes the horizontal overflow on home.
- Photo viewer: the dialog shrinks to the photo, so the close button sits on the photo's corner. On phones it centres
  like a lightbox instead of a bottom sheet with a grab handle. The alt caption matches the photo's width, and the photo
  is capped at 78% of the screen height so the caption stays on screen. With several photos, the previous and next
  arrows and the "1 / 2" counter sit on the photo's own edges and corner, not on the dialog.
- Post composer: keyboard and pointer focus shows as one soft halo around the text row, the same as the messages
  composer, instead of a square outline around the text field.
- Analytics tiles: the change line under each number wraps at 360 px instead of cutting "No change" short.
- Landing in dark theme: the hero backdrop was drawn in its light colours. React does not correct a style attribute that
  differs from the server's markup during hydration, and the backdrop picked its colours from the theme on the client. The
  flat backdrop now reads two theme tokens (`--grain-back`, `--grain-glow`) in CSS, so the server and the client agree.
- Composer: a post that never reaches the server, such as on a dropped connection, used to replace the page with an error
  screen and lose the text. It now keeps the text and says the post did not send. A failed Undo says so too.
- Landing on phones in light theme: the hero uses the calm grain (lower intensity and noise, lifted colours), the same
  variant as the calm bands, so the body copy sits on a quieter ground. Dark theme is unchanged.
- Soft 404 fixed. A missing page used to answer HTTP 200 with the "This page is not here" screen when signed in. The
  session proxy (`proxy.ts`) now runs the page's own first existence check (`lib/route-gate.ts`) before the page streams,
  and rewrites a missing page to a real 404 with that same screen. Gated: a profile that does not exist or has blocked the
  viewer or is deactivated; a profile's followers, following and about pages; a post that does not exist or the viewer may
  not see; a post's analytics unless the viewer wrote the post and it is published; a list or circle that does not exist
  or the viewer may not open; a conversation that does not exist; an invalid topic. Signed out, a missing page still goes
  to /login, as before.
- `/notice` is public. Anyone may tell us about content, with or without an account. The proxy's public page list includes it.

## Verified

Final pass, on the production build run locally (`npm run build`, then `node server.mjs`, two workers, port 3100):

- TypeScript passes for the project. ESLint passes on every changed file. Unit tests: 121 of 121 pass.
- Proxy gate (`scratchpad/gate-test.sh`, real sessions against the e2e database): 35 of 35 pass. This covers the missing
  and blocked cases above, the analytics cases for an author and for another person, and the signed-out redirect.
- Route audit (`scratchpad/all-routes-widths.mjs`): 581 page loads at seven widths (360, 390, 430, 768, 1024, 1440, 1920
  px). That is 34 signed-in routes in light and dark (476 loads) and 15 public pages in light (105 loads). Zero loads had
  horizontal overflow, console errors, HTTP errors or a redirect. Seven contact sheets at 1440 px were reviewed. This audit
  ran before the non-author analytics gate was added; the gate test covers that case.
- End-to-end, full run of all areas: 507 checks, 496 passed, 11 failed (45.7 minutes). Re-run of the account, legal and
  settings areas after the mail sink fix: 107 of 107 passed. Calls passed except the five group-call checks listed below.
  The feed's social-pick check failed in an earlier run and passed in this one; it depends on the state of the database,
  not on a fixed path.

Verified in earlier rounds:

- Route review from screenshots, not only overflow: 13 signed-in routes (home, explore, search, notifications, messages,
  bookmarks, lists, drafts, circles, analytics, settings, own profile, a post) and the signed-out landing at 360, 768 and
  1440 px, light and dark. Four routes at 1024 px in light and at 1920 px in dark. The analytics tiles were the only
  defect found, and they are fixed.
- Landing in dark theme at 360, 390, 768, 1024, 1440 and 1920 px after the fix.
- The landing with the WebGL shader on, at 390 and 1440 px, light and dark. The e2e helpers turn 3D APIs off, so the
  other captures used the flat backdrop. With the shader drawn, the dark landing has its dark grain, and the light
  landing its grey grain, with the text readable.
- Composer while a post is in flight and after a failed one, at phone and desktop widths, light and dark: the text box is
  read-only and marked busy, the button reads Posting, and a failed send keeps the text and shows the message.
- Post analytics as the post's owner, light and dark: the post, its views and the empty engagement state. Another account
  sees "This page is not here".
- Calls, one to one, reviewed on desktop and phone, light and dark, and with reduced motion: outgoing, incoming, active,
  muted and ended states. Each state changes through its fill and label, not through motion alone.

## Measured

Headless Chromium 390 px wide with mobile emulation, 2x device pixel ratio, three runs per case, median shown. These come
from the build container. They are not measurements on a real phone, and the frame cadence is the headless compositor's.
Treat them as a floor, not a device result. The script is `scratchpad/perf.mjs`.

| Case | Conditions | TTFB | FCP | LCP | CLS | Longest input |
|---|---|---|---|---|---|---|
| Landing `/` | none | 29 ms | 364 ms | 936 ms (768 to 1304) | 0 | 832 ms (the first tap navigates) |
| Signed-in home | none | 12 ms | 148 ms | 552 ms (488 to 728) | 0 | 64 ms |
| Landing `/` | CPU 4x, 150 ms round trip, 1.6 Mbps down, 750 kbps up | 9 ms | 1020 ms | 5196 ms (4428 to 5408) | 0 | none |
| Signed-in home | same throttling | 13 ms | 1108 ms | 1108 ms (1044 to 1352) | 0 | 160 ms |

The throttled landing is the one number above the 2.5 s "good" line. The LCP element is the hero's lead paragraph. Its
entrance animation starts after the page has hydrated, and under the throttle hydration is the long part: the first load
ships about 513 KB of script (transferred), and `load` fires near 3.2 s. Two attempts did not move it, and both were
reverted: mounting the shader only after `load` (LCP 5.9 s in the run after), and loading the shader library in its own
chunk (LCP 6.5 s, with more bytes overall). The remaining lever is the amount of JavaScript the landing needs before it
hydrates. Not done.

Other measurements from earlier rounds, headless Chromium, production build:

- Tab selection slide: 41 frames over 700 ms, median 16.7 ms, no frame over 33 ms.
- Post menu opening: median 16.7 ms; at most one frame over 33 ms across runs. Escape closes it, and focus returns to its
  "More options" trigger.
- Photo viewer with a large photo (1200 × 800). On desktop at 1440 px the dialog is 960 px wide, the photo is 960 × 640
  and centred, the caption is 36 px tall beneath it, and the close button sits on the photo's top-right corner. On a
  390 px phone in dark theme the photo is 359 × 239, the caption is the same 359 px wide and runs to two lines, and the
  close button sits on the photo's corner. Escape closes the viewer in both.
- Reduced motion: every landing heading is at full opacity at 390 px, so the scenes read without animation.

## Known failures and open items

- Group calls, computer: the late-join checks fail. Someone who opens the app during a group call sees the Join banner,
  and after Join the card shows the starter's connection as "Couldn't connect" while the other connection connects.
  The run ends with the call showing too few people. The five failing checks are: the Join banner, the Join button on the
  group's own page, Mute, Leave, and the last person ending the call. Earlier diagnostic logging did not find the cause.
  This is the first thing to fix before launch. Phone calls pass.
- Ranking: For you shows the newest posts and the pool is capped at 400 (`FOR_YOU_SIZE`). A stranger's single-like post
  can fall below the first pages on a large database. Not changed, because the ranking is a product decision.
- Legal text: the legal pages say "Draft. This text has not yet been reviewed by a qualified lawyer". That must be settled
  before launch.
- Measure frame timing and Core Web Vitals on a real low-end phone. The landing LCP above is the number to watch.
- The landing's product previews are still hand-built miniatures. Rebuilding them from the real post, poll and composer
  components was not done on purpose: those components import the composer, dialogs and server actions, which would add
  to the public landing's first load. Decide whether the previews must be the real components anyway.
- Very small photos (about 100px wide) are cramped: the caption wraps narrowly, and the arrows, counter and close button
  touch one another. Decided: no minimum viewer size. Phone photos are large, and a minimum would be an invented rule
  that changes how the photo sits. Revisit only if small images turn up in real use.

## Known trade-offs, left as they are

- The phone header is fully transparent, as requested, so scrolled text can sit under the logo mid-page. A soft top
  fade would fix that, if wanted.
- The floating bottom bar is glass at 72% opacity. Scrolled text shows faintly behind it, but its icons stay readable.

## References

The interaction patterns above follow common practice in high-quality product interfaces: shared-element selection,
bottom sheets with drag-to-dismiss, short press feedback, and motion that respects reduced-motion settings. They were
chosen from general knowledge and were not measured frame by frame from those products in this pass.
