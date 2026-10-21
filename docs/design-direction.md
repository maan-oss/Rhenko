# Rhenko design direction

The app and the marketing site share one identity: black and white, one typeface, and depth from layers rather than
decoration. There is no second colour anywhere, and no indigo, blue or purple tint on any surface, shape or text.

## Identity

- Ink is `#0b0b0b` in dark mode and `#fafafa` on paper in light mode. Neutrals stay neutral. Gradients are not used as
  decoration.
- The accent is the ink itself. The verified mark, on-switches and the reader's own messages are black in light mode and
  white in dark mode. Focus is a soft neutral halo, never a coloured or dark outline.
- Sora is the only typeface. Body text is 400 and 600. Display headings are 600 with slightly tight tracking. No second
  family and no italic accent words.
- Depth comes from three surface levels (ground, raised, overlay), a one-pixel inner highlight on raised surfaces, and
  soft neutral shadows. No surface, shadow or outline takes a tint.

## Two shells, built separately

- Desktop (1024px and up) is three columns. A left rail shows icon and label, with the active item on a filled pill. The
  centre column is 600px. The right rail stacks trends and suggestions as raised surfaces.
- Mobile (under 1024px) is one column under a top bar that tightens as the page scrolls. A floating bottom tab bar holds
  five destinations, and its active indicator slides between them. Sheets rise from the bottom and close by dragging.
- The chrome is two components, one per shell. Pages whose composition differs between the two (a profile header, a
  post with full-bleed media) render both variants and hide the one that does not apply with CSS. Only one variant is
  visible at a time, and role-based queries skip the hidden one.

## Motion

- Each page gets one orchestrated entrance, on its first paint. Nothing else animates on load.
- Scroll-linked effects are limited to the marketing site and the profile banner. They use CSS scroll-driven timelines
  where the browser supports them, and `motion/react` scroll hooks elsewhere.
- The art beside sign-in and sign-up is white strands flowing over black (`components/app/auth-flow.tsx`, a canvas). The
  strands draw in once on first paint. After that they move only while the pointer moves across the panel. Under reduced
  motion they are drawn once, still. The panel is decorative, so it is hidden from screen readers. It is black in both
  themes, as the one deliberate dark surface.
- Pointer tilt is at most 6 degrees on feature surfaces, uses springs, and is off on touch devices and under
  `prefers-reduced-motion`.
- Every motion answers a tap, a click or a scroll. Motion that plays unprompted is not added.

## Rules that hold on every page

- Touch targets are at least 44px.
- Keyboard focus is always visible, as the neutral halo.
- Reduced motion turns off every non-essential animation.
- Text labels, accessible names and headings stay as the end-to-end checks read them (`e2e/`). A change that renames
  one of them is a change to the check as well, and it is made in the same commit.
- No new dependencies beyond the current set without a reason written here.

## Page groups (58 routes)

- Core: home feed (For you, Following), explore, search, notifications, messages (list, thread, new), bookmarks, lists
  (list, detail), drafts, notices, packs, topics.
- Profiles: profile, about, followers, following, status and its analytics.
- Creator and money: analytics (overview, posts), advertise, circles (list, detail, new).
- Settings: the hub and nine sections (about, account, appearance, billing, connections, For you, notifications,
  privacy, security, shortcuts).
- Accounts: login (and verify), sign-up, forgot and reset password, accept terms, welcome (about, interests, location).
- Information: copyright, legal, notice, offline, privacy, rules, safety, terms, transparency (and ads).
- Marketing: the landing page, FAQ and the grain backdrop.

## Order of work

1. Shells: the desktop rail, the mobile top bar and the sliding bottom tab bar. Verified against the navigation checks.
2. The feed and the post card, where the post is the main object. Full-bleed media on mobile, a grid on desktop.
3. Profile refinements on the layout from `9db2191`.
4. Messages, notifications, explore and search.
5. Settings and the accounts flow.
6. The marketing site and the information pages.

Each step is committed with the end-to-end areas it touches passing, and the checks are re-run before the next step starts.
