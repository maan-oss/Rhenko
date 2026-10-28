import { Suspense, type ReactNode } from "react"

// A streamed part of a page. It has no placeholder, so the page shows its header at once and this content settles in
// as it arrives, rather than popping in or leaving a blank gap. Reduced motion makes the settle instant.
export function RevealSuspense({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <div className="reveal-in">{children}</div>
    </Suspense>
  )
}
