# Rhenko design system

This is the working reference for every page and component. `docs/design-direction.md` says why; this file says what to
build with. Where they disagree, this file wins for implementation.

## The idea

Rhenko looks like a room at dusk. The page is ink or paper. A single dusk light comes from above, and everything that
matters sits at a height above the page: sheets for content at rest, lifted surfaces for what the reader has
reached toward, floating surfaces for what is on top right now (the dock, sheets, menus). Depth comes from layering and
light, not from borders and dividers. Nothing is boxed in a grid of identical cards.

Two rules keep this from becoming decoration:

- Depth must say something. A sheet is lifted only when the reader can act on it. A floating surface appears only over
  content that has a reason to be covered.
- Motion answers a touch, a click, a scroll or a change of place. Nothing moves on its own except the single page entrance.

## Colour

- Dark (the default look) is ink `#0b0b0b` with sheets at `#141414`. Light is paper `#fafafa` with sheets at `#ffffff`.
  Neutrals are never tinted toward another hue.
- The one accent is dusk: `#3f4a7a` in light, `#aeb8f2` in dark. It marks focus, switches, the verified mark, the
  reader's own messages and the single active state in navigation. Body text never uses it.
- Shadows and glows are dusk-tinted (`color-mix` with `--dusk`), so the light looks like it comes from one place.
- Tokens live in `app/globals.css` (`--background`, `--card`, `--border`, `--depth-*`). A component never writes a colour
  literal that works in one theme only.

## Depth

Three utilities in `globals.css`, each with a flat fallback:

| Utility | Use for | What it does |
| --- | --- | --- |
| `depth-sheet` | a post, a card, a panel at rest | card background, radius `--radius-xl`, dusk-tinted shadow, light top rim |
| `depth-float` | the dock, a sheet over content, a menu | translucent, blurred, the highest shadow |
| `depth-stage` + `depth-plane` | anything that tilts | perspective on the group, rotation from `--rx` and `--ry` |

`DepthTilt` (`components/app/depth.tsx`) wraps a surface in `depth-plane` and sets those variables from the pointer. It
tilts at most 5 degrees by default, only for a mouse, and its glare follows the pointer. Use it for a hero or a
featured card, never for every post. Maximum one tilting group in view at a time on a phone (there is none on touch).

`depth-reveal` fades and lifts an element as it scrolls in, using scroll-driven animation where the browser has it.
Elsewhere the element is simply visible.

## Type

- Sora only. Weights 400 and 600. No italic accents, no second family.
- Display: 600, letter-spacing `-0.035em`, line-height `1.02`, `text-wrap: balance`. Used for profile names, page titles
  on desktop and the marketing headline.
- Counts and times use tabular numerals (`tabular-nums`) so columns line up.
- Sentence case for every label. No all-caps eyebrows, no middle-dot strings, no arrows appended to links or buttons.
- Body line length under 70 characters on desktop.

## Motion

- One entrance per page: the content settles in once on first paint (`settle` in globals.css). Nothing else animates on
  load.
- Scroll effects only where content is long: the profile banner, the marketing page, article-like pages. They use
  `depth-reveal` or the `mk-*` classes.
- Pointer tilt only on desktop (see `DepthTilt`).
- Press feedback: buttons already scale to 0.97 while pressed. Do not add a second press effect on top.
- Every animation has a reduced-motion path. `globals.css` turns these off; components must not rely on JavaScript
  timers for essential state.

## Shells: two layouts, not one responsive grid

Desktop (1024px and up):
- A left rail with the logo, the navigation, the compose action and the account. Items show icon and label. The rail
  can be collapsed (the existing cookie), and then its labels stay in the DOM for screen readers.
- The centre column is 600px. Posts are sheets with a 12px gap, not hairline-divided rows.
- A right rail holds trends and suggestions as sheets. It is hidden under 1280px.

Mobile (under 1024px):
- A top bar with the page title. On scroll it compresses and the title moves into it. The bar is a floating surface, not a
  painted band.
- A floating dock at the bottom: five destinations and the compose action as a raised disc. The active destination has
  the dusk indicator and a small lift. The dock hides under the software keyboard.
- Full-bleed media (edge to edge, rounded only at the top corners of a sheet).

Pages whose composition differs between the two (profile header, post detail, messages thread) render a desktop and a
mobile variant. Both are in the DOM; the one that does not apply is hidden with CSS (`hidden lg:block` and
`lg:hidden`). Role-based queries in the end-to-end tests skip hidden elements, so the labels must be unique within each
variant.

## Labels the end-to-end checks read

The checks in `e2e/` find elements by visible text, accessible name and role. Changing one of these labels is a change to
the check, made in the same commit. Before changing a page, search for its strings:

```
grep -rn "getByRole\|getByText\|getByLabel" e2e/ | grep "<the page's words>"
```

Keep: navigation names (Home, Explore, Notifications, Messages, Bookmarks, Lists, Circles, Drafts, Analytics, Settings,
Search), the compose action (Post), post actions (Reply, Repost, Like, Bookmark, Share, More), profile actions (Follow,
Message, Edit profile, Show more), and the form labels of sign-in and sign-up.

## Components to reuse, not rebuild

- `components/ui/button.tsx`, `dialog.tsx`, `dropdown-menu.tsx`, `input.tsx`: the primitives. Restyle them through tokens.
- `components/app/depth.tsx`: `DepthTilt`.
- `components/app/post-card.tsx`: the one post view. Its layout changes once and every feed gets it.
- `components/app/feed-list.tsx`: the one list. It keeps the merge and paging behaviour.

## Quality floor

- Touch targets 44px or larger.
- Keyboard focus always visible, in dusk.
- Contrast at least 4.5:1 for text in both themes.
- Works at 360px wide with no horizontal page scroll.
- Typecheck (`npx tsc --noEmit`) passes. The end-to-end areas a change touches pass before it is committed.
