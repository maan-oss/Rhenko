"use client"

import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { useRouter } from "next/navigation"
import { createPortal } from "react-dom"
import { motion, useReducedMotion } from "motion/react"
import { useTheme } from "next-themes"
import { Moon, Settings, Sun } from "lucide-react"

type Theme = "light" | "dark"

// The colour the sweep paints in, the same as each theme's page background.
const BACKDROP: Record<Theme, string> = { light: "#f5f1e8", dark: "#212121" }
// A spring with a little overshoot, so the pair wobbles apart and back like jelly.
const JELLY = { type: "spring", stiffness: 380, damping: 13, mass: 0.9 } as const
const noopSubscribe = () => () => {}

function useMounted(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false)
}

// Settings and the light/dark switch, as one stacked pair. The switch sits behind the gear and shows
// the theme you are in: a sun in light, a moon in dark. Hover squashes the pair, a press makes it wobble
// apart, and from there each one works on its own. Changing theme sweeps a panel down the screen in the new colour.
export function ThemeSettings() {
  const router = useRouter()
  const mounted = useMounted()
  const reduce = useReducedMotion()
  const { resolvedTheme, setTheme } = useTheme()
  const [open, setOpen] = useState(false)
  const [sweep, setSweep] = useState<{ to: Theme; phase: "in" | "out" } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  const dark = mounted && resolvedTheme === "dark"
  const next: Theme = dark ? "light" : "dark"

  useEffect(() => {
    if (!open) return
    function onPointer(event: PointerEvent) {
      if (rootRef.current?.contains(event.target as Node)) return
      setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("pointerdown", onPointer)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onPointer)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  function onGear() {
    if (!open) {
      setOpen(true)
      return
    }
    setOpen(false)
    router.push("/settings")
  }

  function onTheme() {
    if (!open) {
      setOpen(true)
      return
    }
    setOpen(false)
    if (reduce) setTheme(next)
    else setSweep({ to: next, phase: "in" })
  }

  // The panel covers the screen in the new colour, the theme changes underneath it, then the panel leaves.
  function onSweepDone() {
    if (!sweep) return
    if (sweep.phase === "in") {
      setTheme(sweep.to)
      setSweep({ to: sweep.to, phase: "out" })
    } else {
      setSweep(null)
    }
  }

  return (
    <>
      <motion.div
        ref={rootRef}
        className="relative h-9 w-[100px] shrink-0"
        whileHover={reduce ? undefined : { scaleX: 0.88, scaleY: 1.1 }}
        whileTap={reduce ? undefined : { scaleX: 0.82, scaleY: 1.16 }}
        transition={JELLY}
      >
        <motion.button
          type="button"
          onClick={onTheme}
          aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
          title={dark ? "Light theme" : "Dark theme"}
          initial={false}
          animate={{ x: open ? -6 : 0 }}
          transition={reduce ? { duration: 0 } : JELLY}
          className="absolute top-0 left-[6px] grid size-9 place-items-center rounded-full border border-border bg-popover text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <motion.span
            key={mounted ? resolvedTheme : "pending"}
            initial={reduce ? false : { rotate: -70, scale: 0.4, opacity: 0 }}
            animate={{ rotate: 0, scale: 1, opacity: 1 }}
            transition={{ duration: 0.4, type: "spring", stiffness: 300, damping: 16 }}
            className="grid place-items-center"
          >
            {dark ? <Moon className="size-[16px]" strokeWidth={1.9} aria-hidden="true" /> : <Sun className="size-[16px]" strokeWidth={1.9} aria-hidden="true" />}
          </motion.span>
        </motion.button>
        <motion.button
          type="button"
          onClick={onGear}
          aria-label="Settings"
          title="Settings"
          aria-expanded={open}
          initial={false}
          animate={{ x: open ? 26 : 0 }}
          transition={reduce ? { duration: 0 } : JELLY}
          className="metal absolute top-0 left-[32px] grid size-9 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Settings className="size-[18px]" strokeWidth={1.9} aria-hidden="true" />
        </motion.button>
      </motion.div>
      {mounted && sweep
        ? createPortal(
            <motion.div
              aria-hidden="true"
              className="pointer-events-none fixed inset-0 z-[150]"
              style={{ backgroundColor: BACKDROP[sweep.to] }}
              initial={{ y: "-100%" }}
              animate={{ y: sweep.phase === "in" ? "0%" : "100%" }}
              transition={{ duration: 0.6, ease: [0.76, 0, 0.24, 1] }}
              onAnimationComplete={onSweepDone}
            >
              <div className="absolute inset-x-0 bottom-0 h-28 bg-linear-to-b from-transparent to-black/12 dark:to-white/10" />
            </motion.div>,
            document.body
          )
        : null}
    </>
  )
}
