"use client"

import Link from "next/link"
import { useRef, useState } from "react"
import { motion } from "motion/react"
import { Clock, Search } from "lucide-react"

// A search circle that opens into a field on hover or focus. Recent searches appear
// beneath it, so the last few are one click away.
export function SidebarSearch({ recent }: { recent: string[] }) {
  const [hovering, setHovering] = useState(false)
  const [focused, setFocused] = useState(false)
  const [text, setText] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const open = hovering || focused

  return (
    <div className="relative" onPointerEnter={() => setHovering(true)} onPointerLeave={() => setHovering(false)}>
      <form action="/search" role="search" className="flex h-11">
        <motion.label
          initial={false}
          animate={{ width: open ? 260 : 44 }}
          transition={{ type: "spring", stiffness: 420, damping: 36 }}
          className={`flex h-11 cursor-text items-center overflow-hidden rounded-full border transition-colors duration-200 ${
            open ? "border-foreground/40 bg-background" : "border-border bg-background"
          }`}
          onClick={() => inputRef.current?.focus()}
        >
          <span className="grid size-11 shrink-0 place-items-center">
            <Search className="size-[18px] text-foreground/80" aria-hidden="true" />
          </span>
          <span className="sr-only">Search Rhenko</span>
          <input
            ref={inputRef}
            name="q"
            type="search"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Search posts and people"
            autoComplete="off"
            className="h-full min-w-0 flex-1 bg-transparent pr-4 text-[15px] outline-none placeholder:text-muted-foreground"
          />
        </motion.label>
      </form>

      {focused && recent.length > 0 ? (
        <div className="absolute top-full left-0 z-40 mt-2 w-[260px] overflow-hidden rounded-2xl border border-border bg-popover p-1.5 shadow-xl">
          <p className="px-3 pt-2 pb-1.5 text-xs font-semibold text-muted-foreground">Recent searches</p>
          <ul>
            {recent.slice(0, 6).map((query) => (
              <li key={query}>
                <Link
                  href={`/search?q=${encodeURIComponent(query)}`}
                  onMouseDown={(event) => event.preventDefault()}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] transition-colors duration-150 hover:bg-foreground/5"
                >
                  <Clock className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 truncate">{query}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
