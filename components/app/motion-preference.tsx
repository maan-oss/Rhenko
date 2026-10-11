"use client"

import { useEffect, useSyncExternalStore, type ReactNode } from "react"
import { MotionConfig } from "motion/react"
import { cn } from "@/lib/utils"

// Reduce motion is a per-browser choice, saved on this device. When it is on, the
// app's animations and transitions are cut to almost nothing, including the ones
// driven by JavaScript. Without it, the device's own reduced-motion setting still applies.
const KEY = "rhenko-reduce-motion"
const listeners = new Set<() => void>()

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1"
  } catch {
    return false
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function useReduceMotion(): boolean {
  return useSyncExternalStore(subscribe, read, () => false)
}

export function MotionPreference({ children }: { children: ReactNode }) {
  const reduce = useReduceMotion()
  useEffect(() => {
    document.documentElement.dataset.reduceMotion = reduce ? "true" : "false"
  }, [reduce])
  return <MotionConfig reducedMotion={reduce ? "always" : "user"}>{children}</MotionConfig>
}

export function ReduceMotionChoice() {
  const on = useReduceMotion()

  function toggle() {
    const next = !on
    try {
      window.localStorage.setItem(KEY, next ? "1" : "0")
    } catch {
      // Storage can be blocked. The choice still applies for this page view.
    }
    document.documentElement.dataset.reduceMotion = next ? "true" : "false"
    listeners.forEach((listener) => listener())
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Reduce motion"
      onClick={toggle}
      className="flex w-full items-center justify-between gap-4 rounded-lg border border-border px-4 py-3 text-left transition-colors hover:bg-muted"
    >
      <span className="flex flex-col gap-0.5">
        <span className="text-[15px] font-semibold">Reduce motion</span>
        <span className="text-sm text-muted-foreground">Turns off counters, entrance animations and other movement. Saved on this device.</span>
      </span>
      <span
        aria-hidden
        className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", on ? "bg-dusk" : "bg-muted-foreground/40")}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-5 rounded-full bg-background shadow transition-transform",
            on && "translate-x-5"
          )}
        />
      </span>
    </button>
  )
}
