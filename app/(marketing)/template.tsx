import { ViewTransition } from "react"
import type { ReactNode } from "react"

// The policy pages and the transparency reports. A link tagged nav-forward slides the next page in from the right, and the Back
// link (nav-back) slides it in from the left, the same as the app's pages (see app/(app)/template.tsx). Anything else, and
// updates inside a page, are left alone.
const DIRECTION = { "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" } as const

export default function MarketingTemplate({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter={DIRECTION} exit={DIRECTION} update="none" share="none" default="none">
      {children}
    </ViewTransition>
  )
}
