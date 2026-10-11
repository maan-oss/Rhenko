"use client"

import { useSyncExternalStore } from "react"
import { useTheme } from "next-themes"
import { CloudMoon, Monitor, Moon, MoonStar, Sun } from "lucide-react"
import { cn } from "@/lib/utils"

const OPTIONS = [
  { value: "system", label: "System", Icon: Monitor },
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "dim", label: "Dim", Icon: CloudMoon },
  { value: "lights-out", label: "Lights out", Icon: MoonStar },
] as const

const noopSubscribe = () => () => {}

export function ThemeChoice() {
  const { theme, setTheme } = useTheme()
  const ready = useSyncExternalStore(noopSubscribe, () => true, () => false)

  return (
    <div role="radiogroup" aria-label="Theme" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = ready && theme === value
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(value)}
            className={cn(
              "flex items-center justify-center gap-2 rounded-lg border px-3 py-3 text-sm font-semibold transition-colors",
              active ? "border-dusk bg-muted" : "border-border hover:bg-muted"
            )}
          >
            <Icon className="size-4" />
            {label}
          </button>
        )
      })}
    </div>
  )
}
