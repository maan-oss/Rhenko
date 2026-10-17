# Redesign status

What the redesign has reached, page group by page group. `docs/design-system.md` says how; `docs/design-direction.md`
says why. A group is done when its routes follow the design system at both widths and the end-to-end areas for it pass.

| Group | State | What changed |
| --- | --- | --- |
| Shells (rail, right rail, top bar, dock, drawer) | Done | Rail active state is a sliding dusk pill. Right rail blocks are depth sheets. Top bar is a floating surface on phones and a plain row on a computer. The dock uses the float surface with a dusk bead. The drawer uses the float shadow. |
| Feed and post | Done | Posts are sheets with a 12px gap, lifted under the pointer on a computer. Nested quotes sit inside a sheet without rules. The composer is a sheet. |
| Primitives | Done | Button is a pill with a 44px phone target and an ink default. Input is 44px on phones. Dialogs and menus use the float shadow and a stronger scrim. `metal` is a flat ink or paper fill with a dusk lift. |
| Profile | Partly | Phones: full-bleed banner. Computer: banner and profile are one sheet. Stats and buttons lose their rules. Not yet: separate phone and computer components, banner motion, tabs redesign. |
| Settings | Partly | Each section is a sheet (account, connections, notifications, privacy, security). Not yet: the settings index list and the rest of the security and billing panels. |
| Auth (sign in, sign up, setup) | Mostly | Flat pill calls to action, 44px eye toggle. Not yet: the art panel and setup pages at both widths. |
| Messages | Partly | Reader's own bubbles already use dusk. Not yet: thread and composer at both widths, touch targets on the reaction picker. |
| Discovery, lists, bookmarks, drafts, notifications, notices, packs, circles | Inherit | Use the shared feed, post card and primitives. No page-specific pass yet. |
| Information pages (privacy, terms, rules, safety, transparency, copyright, legal) | Not started | |
| Marketing (logged-out home) | Not started as a redesign | Scroll sections, intro loader and photographs exist. The design system has not been applied. |

Known gaps across the app: the mobile top bar does not compress on scroll yet; banners have no scroll-linked motion
outside the profile; no page has been checked at 360px wide except the home feed, the profile and settings.
