"use client"

import { useSyncExternalStore } from "react"
import { cn } from "@/lib/utils"

type Size = "default" | "large"
const OPTIONS: { value: Size; label: string; sample: string }[] = [
  { value: "default", label: "Default", sample: "Aa" },
  { value: "large", label: "Large", sample: "Aa" },
]
const KEY = "rhenko-font-size"

function read(): Size {
  try {
    return window.localStorage.getItem(KEY) === "large" ? "large" : "default"
  } catch {
    return "default"
  }
}

const listeners = new Set<() => void>()
function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function choose(next: Size) {
  try {
    window.localStorage.setItem(KEY, next)
  } catch {
    // Storage can be blocked. The choice still applies for this page view.
  }
  document.documentElement.dataset.fontSize = next
  listeners.forEach((listener) => listener())
}

// Text size is a per-browser choice. It is saved on this device only.
export function FontSizeChoice() {
  const size = useSyncExternalStore(subscribe, read, () => "default" as Size)

  return (
    <div role="radiogroup" aria-label="Text size" className="grid grid-cols-2 gap-2">
      {OPTIONS.map((option) => {
        const active = size === option.value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => choose(option.value)}
            className={cn(
              "flex flex-col items-center gap-1 rounded-lg border px-3 py-3 text-sm font-semibold transition-colors",
              active ? "border-dusk bg-muted" : "border-border hover:bg-muted"
            )}
          >
            <span className={option.value === "large" ? "text-xl" : "text-base"}>{option.sample}</span>
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
