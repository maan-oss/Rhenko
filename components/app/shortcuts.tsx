"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { SHORTCUTS } from "@/lib/shortcuts"

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return target.matches("input, textarea, select") || target.closest("[role='dialog']") !== null
}

// Keyboard navigation for people who use the keys. Shortcuts are ignored while typing.
export function Shortcuts({ handle }: { handle: string }) {
  const router = useRouter()
  const [help, setHelp] = useState(false)

  useEffect(() => {
    let pendingG = false
    let gTimer: number | undefined
    const clearG = () => {
      pendingG = false
      if (gTimer !== undefined) window.clearTimeout(gTimer)
    }

    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return
      const key = event.key

      if (pendingG) {
        const destinations: Record<string, string> = {
          h: "/",
          e: "/explore",
          n: "/notifications",
          m: "/messages",
          b: "/bookmarks",
          p: `/${handle}`,
        }
        clearG()
        if (destinations[key]) {
          event.preventDefault()
          router.push(destinations[key])
        }
        return
      }

      if (key === "g") {
        pendingG = true
        gTimer = window.setTimeout(clearG, 1200)
      } else if (key === "n") {
        event.preventDefault()
        if (window.location.pathname === "/") {
          document.getElementById("compose")?.scrollIntoView({ block: "start" })
          document.querySelector<HTMLTextAreaElement>("#compose textarea")?.focus()
        } else {
          router.push("/#compose")
        }
      } else if (key === "/") {
        event.preventDefault()
        router.push("/explore")
      } else if (key === "j" || key === "k") {
        const articles = [...document.querySelectorAll<HTMLElement>("article")]
        if (articles.length === 0) return
        const viewportMid = window.innerHeight / 2
        const current = articles.findIndex((el) => el.getBoundingClientRect().top > viewportMid - 80)
        const target =
          key === "j"
            ? articles[current === -1 ? articles.length - 1 : current]
            : articles[Math.max((current === -1 ? articles.length : current) - 2, 0)]
        target?.scrollIntoView({ block: "center", behavior: "smooth" })
        target?.focus({ preventScroll: true })
      } else if (key === "?") {
        event.preventDefault()
        setHelp(true)
      }
    }

    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("keydown", onKey)
      clearG()
    }
  }, [handle, router])

  return (
    <Dialog open={help} onOpenChange={setHelp}>
      <DialogContent className="sm:max-w-sm" showCloseButton>
        <DialogTitle className="text-lg font-semibold">Keyboard shortcuts</DialogTitle>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-[15px]">
          {SHORTCUTS.map((shortcut) => (
            <div key={shortcut.keys} className="contents">
              <dt>
                <kbd className="rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-[13px]">{shortcut.keys}</kbd>
              </dt>
              <dd className="text-muted-foreground">{shortcut.label}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  )
}
