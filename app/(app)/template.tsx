import { ViewTransition } from "react"
import type { ReactNode } from "react"

// Only a navigation that says which way it goes animates: a link tagged nav-forward slides the page in from the right, and
// the Back arrow (nav-back) slides it in from the left. Everything else is left alone. That includes updates inside a page
// (typing, likes, tabs), router.refresh() and Suspense reveals. Those run the same transition path, so an animation there
// covers the page while it is still changing, which is what broke the composer and the feed in the e2e runs.
// The keyframes live in globals.css, next to the reduced-motion rule that switches them off.
const DIRECTION = { "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" } as const

export default function AppTemplate({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter={DIRECTION} exit={DIRECTION} update="none" share="none" default="none">
      {children}
    </ViewTransition>
  )
}
