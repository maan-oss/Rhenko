import { ViewTransition } from "react"
import type { ReactNode } from "react"

// Sign in and sign up. A link tagged nav-forward (from the landing page's buttons) slides the page in from the right, and the
// Back link (nav-back) slides it in from the left. Links between these pages, and updates inside a form, are left alone.
const DIRECTION = { "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" } as const

export default function AuthTemplate({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter={DIRECTION} exit={DIRECTION} update="none" share="none" default="none">
      {children}
    </ViewTransition>
  )
}
