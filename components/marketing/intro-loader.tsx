"use client"

import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "motion/react"
import { RhenkoSymbol } from "@/components/brand/symbol"

// The first visit to the landing page in a browsing session gets a short opening: a count to 100, then the panel lifts off
// the page. It always leaves the page underneath usable. A click or a key press skips it, and reduced motion skips it
// entirely. The panel keeps its own colours so the opening reads the same in either theme.
const SEEN_KEY = "rhenko-opening-seen"
const DURATION_MS = 1500

function seen() {
  try {
    return window.sessionStorage.getItem(SEEN_KEY) === "1"
  } catch {
    return false
  }
}

function markSeen() {
  try {
    window.sessionStorage.setItem(SEEN_KEY, "1")
  } catch {
    // Storage can be blocked. The opening then shows once more on the next visit, which is harmless.
  }
}

export function IntroLoader() {
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState(0)
  const [lifting, setLifting] = useState(false)

  useEffect(() => {
    if (seen() || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    setOpen(true)
    document.documentElement.setAttribute("data-opening", "on")

    let frame = 0
    let timer = 0
    const start = performance.now()
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / DURATION_MS)
      setCount(Math.round(progress * 100))
      if (progress < 1) frame = requestAnimationFrame(tick)
      else timer = window.setTimeout(lift, 220)
    }
    const lift = () => {
      setLifting(true)
      markSeen()
      window.setTimeout(close, 900)
    }
    const close = () => {
      setOpen(false)
      document.documentElement.removeAttribute("data-opening")
    }
    const skip = () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(timer)
      setCount(100)
      lift()
    }
    frame = requestAnimationFrame(tick)
    window.addEventListener("keydown", skip, { once: true })
    window.addEventListener("pointerdown", skip, { once: true })
    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(timer)
      window.removeEventListener("keydown", skip)
      window.removeEventListener("pointerdown", skip)
      document.documentElement.removeAttribute("data-opening")
    }
  }, [])

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="opening"
          aria-hidden
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#0b0b0c] text-[#f4f4f5]"
          initial={{ y: 0 }}
          animate={{ y: lifting ? "-100%" : 0 }}
          transition={{ duration: 0.9, ease: [0.76, 0, 0.24, 1] }}
        >
          <motion.div
            className="flex flex-col items-center gap-10"
            initial={{ opacity: 0, filter: "blur(8px)" }}
            animate={{ opacity: lifting ? 0 : 1, filter: "blur(0px)" }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <RhenkoSymbol className="size-12" />
            <div className="flex flex-col items-center gap-4">
              <p className="font-semibold text-[84px] leading-none tracking-tighter tabular-nums sm:text-[120px]">
                {String(count).padStart(3, "0")}
              </p>
              <div className="h-px w-56 overflow-hidden bg-white/15">
                <div className="h-full bg-foreground transition-[width] duration-100 ease-linear" style={{ width: `${count}%` }} />
              </div>
              <p className="text-[13px] text-white/55">Public conversation, on your terms.</p>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
