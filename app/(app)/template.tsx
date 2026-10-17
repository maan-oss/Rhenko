import { ViewTransition } from "react"
import type { ReactNode } from "react"

// Every page in the app moves in as one piece. A link tagged nav-forward slides the page in from the right, and a link
// tagged nav-back (the Back arrow) slides it in from the left. Anything else rises a few pixels as it fades in. The
// browser draws these from snapshots, so fixed elements in a page still sit where they should. The keyframes live in
// globals.css, next to the reduced-motion rule that switches them off.
const DIRECTION = { "nav-forward": "nav-forward", "nav-back": "nav-back", default: "page-rise" }

export default function AppTemplate({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter={DIRECTION} exit={DIRECTION} default="page-rise">
      {children}
    </ViewTransition>
  )
}
