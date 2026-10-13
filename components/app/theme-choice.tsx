"use client"

import { useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react"
import { createPortal } from "react-dom"
import { motion, useReducedMotion } from "motion/react"
import { useTheme } from "next-themes"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

type Theme = "light" | "dark"

// The preview windows show each theme's real colours whatever theme is active, so they are fixed here
// rather than read from the page's tokens. They match the palette in app/globals.css.
const PREVIEW: Record<Theme, { bg: string; panel: string; bar: string; line: string; ink: string; edge: string }> = {
  light: { bg: "#fafafa", panel: "#ffffff", bar: "#f0f0f0", line: "#d4d4d4", ink: "#0a0a0a", edge: "#e5e5e5" },
  dark: { bg: "#0b0b0b", panel: "#141414", bar: "#1a1a1a", line: "#3a3a3a", ink: "#f2f2f2", edge: "#262626" },
}

const OPTIONS: { value: Theme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
]

// The colour the sweep paints in: each theme's page background.
const BACKDROP: Record<Theme, string> = { light: "#fafafa", dark: "#0b0b0b" }

const noopSubscribe = () => () => {}

// A small window drawn in one theme: a title strip, a side column and two feed cards.
function WindowPreview({ theme }: { theme: Theme }) {
  const p = PREVIEW[theme]
  return (
    <div aria-hidden="true" className="flex aspect-[16/10] flex-col overflow-hidden rounded-xl border" style={{ background: p.bg, borderColor: p.edge }}>
      <div className="flex h-4 shrink-0 items-center gap-1 px-2" style={{ background: p.bar }}>
        <span className="size-1.5 rounded-full" style={{ background: p.line }} />
        <span className="size-1.5 rounded-full" style={{ background: p.line }} />
        <span className="size-1.5 rounded-full" style={{ background: p.line }} />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="flex w-[24%] flex-col gap-1.5 p-2" style={{ background: p.panel }}>
          <span className="h-1.5 w-full rounded-full" style={{ background: p.ink }} />
          <span className="h-1.5 w-4/5 rounded-full" style={{ background: p.line }} />
          <span className="h-1.5 w-3/5 rounded-full" style={{ background: p.line }} />
        </div>
        <div className="flex flex-1 flex-col gap-1.5 p-2">
          <div className="rounded-md p-1.5" style={{ background: p.panel }}>
            <span className="block h-1.5 w-2/3 rounded-full" style={{ background: p.ink }} />
            <span className="mt-1.5 block h-1 w-full rounded-full" style={{ background: p.line }} />
          </div>
          <div className="rounded-md p-1.5" style={{ background: p.panel }}>
            <span className="block h-1.5 w-1/2 rounded-full" style={{ background: p.ink }} />
            <span className="mt-1.5 block h-1 w-5/6 rounded-full" style={{ background: p.line }} />
          </div>
        </div>
      </div>
    </div>
  )
}

export function ThemeChoice() {
  const { theme, setTheme } = useTheme()
  const ready = useSyncExternalStore(noopSubscribe, () => true, () => false)
  const reduce = useReducedMotion()
  const [sweep, setSweep] = useState<{ to: Theme; phase: "in" | "out" } | null>(null)
  const group = useRef<HTMLDivElement>(null)
  const current: Theme = ready && theme === "dark" ? "dark" : "light"

  // A panel sweeps down the screen in the new colour, the theme changes underneath it, and the panel leaves.
  // Reduced motion gets the change with no sweep.
  function choose(next: Theme) {
    if (!ready || next === current) return
    if (reduce) setTheme(next)
    else setSweep({ to: next, phase: "in" })
  }

  function onSweepDone() {
    if (!sweep) return
    if (sweep.phase === "in") {
      setTheme(sweep.to)
      setSweep({ to: sweep.to, phase: "out" })
    } else {
      setSweep(null)
    }
  }

  // Radio groups move the selection with the arrow keys, and only the selected card sits in the tab order.
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return
    event.preventDefault()
    const next: Theme = current === "dark" ? "light" : "dark"
    choose(next)
    group.current?.querySelector<HTMLButtonElement>(`[data-theme-value="${next}"]`)?.focus()
  }

  return (
    <>
      <div ref={group} role="radiogroup" aria-label="Theme" onKeyDown={onKeyDown} className="grid grid-cols-2 gap-3">
        {OPTIONS.map(({ value, label }) => {
          const active = ready && theme === value
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              data-theme-value={value}
              tabIndex={!ready || active ? 0 : -1}
              onClick={() => choose(value)}
              className={cn(
                "flex flex-col gap-2.5 rounded-2xl border p-2 text-left transition-colors duration-200",
                active ? "border-foreground" : "border-border hover:border-foreground/40"
              )}
            >
              <WindowPreview theme={value} />
              <span className="flex items-center justify-between px-1 pb-0.5 text-sm font-semibold">
                {label}
                <span
                  aria-hidden="true"
                  className={cn(
                    "grid size-4 place-items-center rounded-full border transition-colors duration-200",
                    active ? "border-foreground bg-foreground text-background" : "border-border"
                  )}
                >
                  {active ? <Check className="size-2.5" strokeWidth={3} /> : null}
                </span>
              </span>
            </button>
          )
        })}
      </div>
      {ready && sweep
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
