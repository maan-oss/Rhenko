"use client"

import { useSyncExternalStore } from "react"
import { useTheme } from "next-themes"
import { Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"

const noopSubscribe = () => () => {}

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  // resolvedTheme is unknown on the server, so the icon and label only
  // render after mount to avoid a hydration mismatch.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false)

  const isDark = mounted && (resolvedTheme === "dark" || resolvedTheme === "dim" || resolvedTheme === "lights-out")

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {mounted ? isDark ? <Sun /> : <Moon /> : <span className="size-4" aria-hidden="true" />}
    </Button>
  )
}
