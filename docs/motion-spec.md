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

## Implemented in this pass

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

Verified in this pass: a horizontal-overflow check at 360, 390, 430, 768, 1024, 1440 and 1920 px across eight main
routes (light theme) reports no overflow. A route audit of 104 visits (about 50 routes, signed-out and signed-in, at 360px,
phone and desktop) reports no overflow, no HTTP errors and no console errors. The e2e suites for auth, feed, posts and
social pass (211 checks, 0 failures).

Verified in the latest round:

- Route review from screenshots, not only overflow: 13 signed-in routes (home, explore, search, notifications, messages,
  bookmarks, lists, drafts, circles, analytics, settings, own profile, a post) and the signed-out landing at 360, 768 and
  1440 px, light and dark. Four routes at 1024 px in light and at 1920 px in dark. The analytics tiles were the only
  defect found, and they are fixed.
- Landing in dark theme at 360, 390, 768, 1024, 1440 and 1920 px after the fix. Light theme at 360 and 390 px after the
  fix. The headless browser did not mount the WebGL shader, so the page drew the flat backdrop. The shader's dark palette
  has not been seen.
- Composer while a post is in flight and after a failed one, at phone and desktop widths, light and dark: the text box is
  read-only and marked busy, the button reads Posting, and a failed send keeps the text and shows the message.
- E2E: posts 67 of 67 after the composer change. Auth 57 of 57 on a rerun. The first auth run had one failure, a 404
  console error during two-factor sign-in, which did not come back.
- TypeScript passes for the project, ESLint passes on the changed files, and the production build passes.

Verified in the route review that followed:

- Every signed-in route and public page (82 captures) at 390 px. Signed-in routes in light and dark, public pages in light.
  No overflow, console errors or HTTP errors. Looked at as contact sheets; no layout defect found.
- Post analytics as the post's owner, light and dark: the post, its views and the empty engagement state. Another account
  sees "This page is not here".
- The landing with the WebGL shader on, at 390 and 1440 px, light and dark. The e2e helpers turn 3D APIs off, so the
  captures in this section used the flat backdrop. Here the shader was drawn: the dark landing has its dark grain, and the
  light landing its grey grain, with the text readable.
- The composer's pending and failed states under reduced motion: the same states as without it.

## Measured in this pass

These come from headless Chromium in the build container, against the production build. They are not measurements on a
real phone, and the frame cadence is the headless compositor's, so treat them as a floor, not a device result.

- Landing, 390px: LCP 588 ms, CLS 0.
- Landing, 1440px: LCP 760 to 776 ms, CLS 0.
- Signed-in home, 390px: LCP 724 ms, CLS 0.003. Worst event latency after a menu open and a tab tap: 48 to 96 ms.
- Tab selection slide: 41 frames over 700 ms, median 16.7 ms, no frame over 33 ms.
- Post menu opening: median 16.7 ms; at most one frame over 33 ms across runs.
- Post menu: Escape closes it, and focus returns to its "More options" trigger.
- Dark theme (set through the app's theme setting): home at desktop and phone, notifications, settings, and the landing
  at 390 and 1440. No token inconsistencies were seen in those screens.
- Reduced motion: every landing heading is at full opacity at 390px, so the scenes read without animation.
- Calls, one to one, reviewed on desktop and phone, light and dark, and with reduced motion: outgoing, incoming, active,
  muted and ended states. Each state changes through its fill and label, not through motion alone.
- Photo viewer checked with 96 px and 80 px test images on desktop and phone, light and dark. Escape closes it and
  focus returns to the photo's button.
- Photo viewer with a large photo (1200 × 800, stored at full size). On desktop at 1440px the dialog is 960 px wide,
  the photo is 960 × 640 and centred, the caption is 36 px tall beneath it, and the close button sits on the photo's
  top-right corner. On a 390px phone in dark theme the photo is 359 × 239, the caption is the same 359 px wide and runs
  to two lines, and the close button sits on the photo's corner. Escape closes the viewer in both.
- Post "More options" on phone opens as a bottom sheet in dark theme, and Escape returns focus to the button.
- E2E posts suite passes after the viewer and composer changes, including the viewer anchoring fix: 67 checks, 0 failures.

## Known trade-offs, left as they are

- The phone header is fully transparent, as requested, so scrolled text can sit under the logo mid-page. A soft top
  fade would fix that, if wanted.
- The floating bottom bar is glass at 72% opacity. Scrolled text shows faintly behind it, but its icons stay readable.

## Still to do

- At 1440 px, only 13 signed-in routes and the landing have been looked at. The other routes were looked at at 390 px only.
- Soft 404: when signed in, a missing page returns HTTP 200 with the "This page is not here" screen, not 404. Signed out, a
  missing page redirects to /login. The cause has not been traced.
- The legal pages say "Draft. This text has not yet been reviewed by a qualified lawyer". That must be settled before launch.
- On a 390 px phone in light theme, the hero's body copy sits over dense grain. It is readable but busier than on desktop.
  The calm grain variant is an option for phones.
- Very small photos (about 100px wide) are cramped: the caption wraps narrowly, and the arrows, counter and close button
  touch one another. Decided: no minimum viewer size. Phone photos are large, and a minimum would be an invented rule
  that changes how the photo sits. Revisit only if small images turn up in real use.
- The landing's product previews are still hand-built miniatures. Rebuilding them from the real post, poll and composer
  components was not done on purpose: those components import the composer, dialogs and server actions, which would add
  to the public landing's first load. Decide whether the previews must be the real components anyway.
- Measure frame timing and Core Web Vitals on a real low-end phone.

## References

The interaction patterns above follow common practice in high-quality product interfaces: shared-element selection,
bottom sheets with drag-to-dismiss, short press feedback, and motion that respects reduced-motion settings. They were
chosen from general knowledge and were not measured frame by frame from those products in this pass.
