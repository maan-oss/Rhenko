"use client"

import { useEffect, useState } from "react"
import { RhenkoSymbol } from "@/components/brand/symbol"
import { OPENING_ATTR, OPENING_SEEN_KEY } from "@/lib/opening"

// The opening is in the markup from the start, hidden by CSS. The head script (lib/opening.ts) turns it on before the first
// paint for a first visit in a browsing session, so the page is never seen underneath it first. This component then runs
// the count, lifts the panel off the page and records the visit. A click or key press skips the count. Reduced motion and
// later visits never see it. The panel keeps its own colours, so it reads the same in either theme.
const DURATION_MS = 1500
const HOLD_MS = 220
const LIFT_MS = 900
const LIFT_EASE = "cubic-bezier(0.76, 0, 0.24, 1)"

function markSeen() {
  try {
    window.sessionStorage.setItem(OPENING_SEEN_KEY, "1")
  } catch {
    // Storage can be blocked. The opening then shows once more on the next visit, which is harmless.
  }
}

export function IntroLoader() {
  const [count, setCount] = useState(0)
  const [lifting, setLifting] = useState(false)

  useEffect(() => {
    const root = document.documentElement
    // Only a first visit carries the attribute. Anything else has no opening to run.
    if (!root.hasAttribute(OPENING_ATTR)) return

    let frame = 0
    let hold = 0
    let done = 0
    let lifted = false
    const start = performance.now()

    const lift = () => {
      if (lifted) return
      lifted = true
      setCount(100)
      setLifting(true)
      markSeen()
      done = window.setTimeout(() => root.removeAttribute(OPENING_ATTR), LIFT_MS)
    }
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / DURATION_MS)
      setCount(Math.round(progress * 100))
      if (progress < 1) frame = requestAnimationFrame(tick)
      else hold = window.setTimeout(lift, HOLD_MS)
    }
    const skip = () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(hold)
      lift()
    }
    frame = requestAnimationFrame(tick)
    window.addEventListener("keydown", skip, { once: true })
    window.addEventListener("pointerdown", skip, { once: true })
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(hold)
      window.clearTimeout(done)
      window.removeEventListener("keydown", skip)
      window.removeEventListener("pointerdown", skip)
      // Left after the panel began to lift: the visit is recorded, so the panel must not come back on this page.
      // Left during the count, the attribute stays, so a remount runs the opening again (React's strict mode remounts once).
      if (lifted) root.removeAttribute(OPENING_ATTR)
    }
  }, [])

  return (
    <div
      aria-hidden
      className="intro-opening fixed inset-0 z-[100] flex-col items-center justify-center bg-[#0b0b0c] text-[#f4f4f5]"
      style={{
        transform: lifting ? "translateY(-100%)" : "translateY(0)",
        transition: `transform ${LIFT_MS}ms ${LIFT_EASE}`,
      }}
    >
      <div
        className="intro-inner flex flex-col items-center gap-10"
        style={{ opacity: lifting ? 0 : 1, transition: "opacity 600ms ease-out" }}
      >
        <RhenkoSymbol className="size-12" />
        <div className="flex flex-col items-center gap-4">
          <p className="font-semibold text-[84px] leading-none tracking-tighter tabular-nums sm:text-[120px]">
            {String(count).padStart(3, "0")}
          </p>
          <div className="h-px w-56 overflow-hidden bg-white/15">
            <div className="h-full bg-[#f4f4f5] transition-[width] duration-100 ease-linear" style={{ width: `${count}%` }} />
          </div>
          <p className="text-[13px] text-white/55">Public conversation, on your terms.</p>
        </div>
      </div>
    </div>
  )
}
