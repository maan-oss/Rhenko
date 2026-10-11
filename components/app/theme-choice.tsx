"use client"

import { useSyncExternalStore } from "react"
import { useTheme } from "next-themes"
import { Moon, Sun } from "lucide-react"
import { cn } from "@/lib/utils"

const OPTIONS = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
] as const

const noopSubscribe = () => () => {}

export function ThemeChoice() {
  const { theme, setTheme } = useTheme()
  const ready = useSyncExternalStore(noopSubscribe, () => true, () => false)

  return (
    <div role="radiogroup" aria-label="Theme" className="grid grid-cols-2 gap-2">
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
              "flex items-center justify-center gap-2 rounded-full border px-4 py-3 text-sm font-semibold transition-[background-color,border-color,color] duration-200",
              active ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted"
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
