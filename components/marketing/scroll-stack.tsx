"use client"

import { useEffect, useRef, type ReactNode } from "react"
import { cn } from "@/lib/utils"

// A stack of cards that pins one after another as the page scrolls. Each card sticks just under the header and the next
// card slides over it. The card underneath shrinks a little and dims as the one above reaches it, so the stack reads as
// depth rather than a list. Without JavaScript the cards simply scroll past each other. Reduced motion keeps the pinning
// and drops the shrinking.

export function ScrollStack({ children, className }: { children: ReactNode[]; className?: string }) {
  const refs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (reduced) return
    let frame = 0

    const update = () => {
      frame = 0
      const cards = refs.current
      for (let index = 0; index < cards.length; index++) {
        const card = cards[index]
        const next = cards[index + 1]
        if (!card) continue
        let depth = 0
        if (next) {
          const top = Number.parseFloat(getComputedStyle(card).top) || 0
          const nextRect = next.getBoundingClientRect()
          // 0 while the next card is a full screen away, 1 once it has reached the pinned position.
          depth = Math.min(Math.max(1 - (nextRect.top - top) / (window.innerHeight * 0.55), 0), 1)
        }
        card.style.transform = `scale(${(1 - 0.045 * depth).toFixed(4)})`
        card.style.filter = depth > 0 ? `brightness(${(1 - 0.22 * depth).toFixed(3)})` : ""
      }
    }

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
    }
  }, [children.length])

  return (
    <div className={cn("relative", className)}>
      {children.map((child, index) => (
        <div
          key={index}
          ref={(node) => {
            refs.current[index] = node
          }}
          className="sticky mb-[12vh] origin-top will-change-transform last:mb-0"
          style={{ top: `calc(96px + ${index * 18}px)`, zIndex: index + 1 }}
        >
          {child}
        </div>
      ))}
    </div>
  )
}
