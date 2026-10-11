"use client"

import { useRef, useSyncExternalStore, type KeyboardEvent } from "react"
import { useTheme } from "next-themes"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

type Theme = "light" | "dark"

// The preview windows show each theme's real colours whatever theme is active, so they are fixed here
// rather than read from the page's tokens. They match the palette in app/globals.css.
const PREVIEW: Record<Theme, { bg: string; panel: string; bar: string; line: string; ink: string; edge: string }> = {
  light: { bg: "#f5f1e8", panel: "#fbf8f2", bar: "#ebe5d6", line: "#d9d1bd", ink: "#1f1d1a", edge: "#ddd5c2" },
  dark: { bg: "#212121", panel: "#2b2b2b", bar: "#2f2f2f", line: "#4a4a4a", ink: "#ececec", edge: "#3d3d3d" },
}

const OPTIONS: { value: Theme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
]

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
  const group = useRef<HTMLDivElement>(null)

  // Radio groups move the selection with the arrow keys, and only the selected card sits in the tab order.
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return
    event.preventDefault()
    const next: Theme = ready && theme === "dark" ? "light" : "dark"
    setTheme(next)
    group.current?.querySelector<HTMLButtonElement>(`[data-theme-value="${next}"]`)?.focus()
  }

  return (
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
            onClick={() => setTheme(value)}
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
  )
}
