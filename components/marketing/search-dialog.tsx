"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { Search } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

// What the palette can open. Sections of this page are anchors on the page itself; the rest are pages of the site.
const INDEX: { label: string; href: string; group: string; words: string }[] = [
  { label: "The feed you steer", href: "#feed", group: "On this page", words: "for you following not interested snooze mute topics" },
  { label: "Calls", href: "#calls", group: "On this page", words: "one to one group call voice video six people" },
  { label: "Circles and lists", href: "#circles", group: "On this page", words: "circles charter open closed ask to join lists priority" },
  { label: "How the feed ranks", href: "#ranking", group: "On this page", words: "ranking candidates sources pools learned weights" },
  { label: "Features", href: "#features", group: "On this page", words: "sahayak stickers edit history polls drafts passkeys" },
  { label: "Create an account", href: "/signup", group: "Start", words: "sign up join register" },
  { label: "Log in", href: "/login", group: "Start", words: "sign in account password" },
  { label: "Rules", href: "/rules", group: "Trust and safety", words: "policy not allowed abuse" },
  { label: "Safety", href: "/safety", group: "Trust and safety", words: "report block protect emergency" },
  { label: "Transparency", href: "/transparency", group: "Trust and safety", words: "reports notices hidden posts appeals counts" },
  { label: "Privacy", href: "/privacy", group: "Trust and safety", words: "data stored rights" },
  { label: "Terms", href: "/terms", group: "Trust and safety", words: "agreement rules broken" },
  { label: "Advertise", href: "/advertise", group: "More", words: "ads business promote" },
  { label: "Legal", href: "/legal", group: "More", words: "notices law operator" },
]

export function SearchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)

  const results = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (terms.length === 0) return INDEX
    return INDEX.filter((item) => {
      const haystack = `${item.label} ${item.group} ${item.words}`.toLowerCase()
      return terms.every((term) => haystack.includes(term))
    })
  }, [query])

  const current = Math.min(active, Math.max(results.length - 1, 0))

  function reset(next: boolean) {
    if (!next) {
      setQuery("")
      setActive(0)
    }
    onOpenChange(next)
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setActive(() => (results.length === 0 ? 0 : (current + 1) % results.length))
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setActive(() => (results.length === 0 ? 0 : (current - 1 + results.length) % results.length))
    } else if (event.key === "Enter" && results[current]) {
      event.preventDefault()
      const target = results[current]
      reset(false)
      if (target.href.startsWith("#")) {
        document.querySelector(target.href)?.scrollIntoView({ behavior: "smooth", block: "start" })
      } else {
        window.location.assign(target.href)
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogContent className="top-[18%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-lg" showCloseButton={false}>
        <DialogTitle className="sr-only">Search Rhenko</DialogTitle>
        <DialogDescription className="sr-only">Type to find a section of this page or a page of the site. Use the arrow keys and Enter.</DialogDescription>
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActive(0)
            }}
            onKeyDown={onKeyDown}
            placeholder="Find a section or a page"
            aria-label="Find a section or a page"
            aria-controls="search-results"
            aria-activedescendant={results[current] ? `search-${current}` : undefined}
            className="h-14 w-full bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
          />
        </div>
        <ul id="search-results" role="listbox" className="max-h-[360px] overflow-y-auto p-2">
          {results.length === 0 ? (
            <li className="px-3 py-8 text-center text-[14px] text-muted-foreground">Nothing matches that. Try a shorter word.</li>
          ) : (
            results.map((item, index) => (
              <li key={item.href} role="option" id={`search-${index}`} aria-selected={index === current}>
                <Link
                  href={item.href}
                  onClick={() => reset(false)}
                  onMouseEnter={() => setActive(index)}
                  className={cn(
                    "flex items-center justify-between gap-4 rounded-xl px-3 py-2.5 text-[14px] outline-none transition-colors",
                    index === current ? "bg-muted text-foreground" : "text-muted-foreground"
                  )}
                >
                  <span className={cn(index === current && "font-semibold text-foreground")}>{item.label}</span>
                  <span className="text-[12px] text-muted-foreground">{item.group}</span>
                </Link>
              </li>
            ))
          )}
        </ul>
        <div className="hidden border-t border-border px-4 py-2.5 text-[12px] text-muted-foreground sm:block">
          Arrow keys move, Enter opens, Esc closes.
        </div>
      </DialogContent>
    </Dialog>
  )
}
