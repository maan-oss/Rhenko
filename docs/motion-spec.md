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

Verified in this pass: a horizontal-overflow check at 360, 390, 430, 768, 1024, 1440 and 1920 px across eight main
routes (light theme) reports no overflow, and the e2e suites for auth, feed, posts and social pass (211 checks).

## Still to do

- Audit the remaining routes one by one (about 50 are not yet reviewed at phone width).
- Measure real frame timing on a low-end device. Current timings come from the table above and are not yet measured.
- Review the calls, photo label and composer states against the actual product flows.

## References

The interaction patterns above follow common practice in high-quality product interfaces: shared-element selection,
bottom sheets with drag-to-dismiss, short press feedback, and motion that respects reduced-motion settings. They were
chosen from general knowledge and were not measured frame by frame from those products in this pass.
