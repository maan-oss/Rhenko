"use client"

import Link from "@/components/app/link"
import { useRef, useState, type KeyboardEvent } from "react"
import { motion } from "motion/react"
import { ArrowUpRight, Clock, Search, X, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

// Timings measured on the America.gov menu. The card fades in after a short beat, and the
// rows fade up one after another in a 35ms stagger over 480ms. Nothing moves.
type Curve = [number, number, number, number]
const STANDARD: Curve = [0.4, 0, 0.2, 1]
const DECELERATE: Curve = [0.22, 0, 0.2, 1]
const SMOOTH = "ease-[cubic-bezier(0.22,1,0.36,1)]"

const body = {
  hidden: { opacity: 0, transition: { duration: 0.12, ease: STANDARD } },
  show: { opacity: 1, transition: { duration: 0.16, delay: 0.1, ease: STANDARD } },
}
const list = {
  hidden: {},
  show: { transition: { delayChildren: 0.175, staggerChildren: 0.035 } },
}
const row = {
  hidden: { opacity: 0, transition: { duration: 0.12 } },
  show: { opacity: 1, transition: { duration: 0.48, ease: DECELERATE } },
}

// The field and its card are one surface. The field is a pill. Focusing it, the same surface grows downward to hold the
// recent searches, and sits over the nav without pushing it.
export function SidebarSearch({ recent }: { recent: string[] }) {
  const [focused, setFocused] = useState(false)
  const [text, setText] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  const query = text.trim()
  const matches = query ? recent.filter((item) => item.toLowerCase().includes(query.toLowerCase())) : recent
  // Three is the most recent searches the panel shows, with or without a query typed.
  const shown = matches.slice(0, 3)

  function onKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === "Escape") {
      const active = document.activeElement as HTMLElement | null
      if (active && formRef.current?.contains(active)) active.blur()
      setFocused(false)
      return
    }
    // Arrow down from the field moves into the card, so the list works without a mouse.
    if (event.key === "ArrowDown" && focused && event.target === inputRef.current) {
      const first = formRef.current?.querySelector<HTMLAnchorElement>("[data-search-row]")
      if (first) {
        event.preventDefault()
        first.focus()
      }
    }
  }

  return (
    // The form keeps the field's height in the layout. The surface below is absolute, so the card overlays the nav.
    <form
      ref={formRef}
      action="/search"
      role="search"
      className="relative h-11 w-full"
      onKeyDown={onKeyDown}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false)
      }}
    >
      <div
        onClick={() => inputRef.current?.focus()}
        className={cn(
          "absolute inset-x-0 top-0 z-40 cursor-text overflow-hidden ring-1 ring-border transition-[box-shadow,border-radius,background-color] duration-300 focus-within:ring-foreground/40",
          SMOOTH,
          focused ? "rounded-[26px] bg-popover [box-shadow:var(--lift-shadow)]" : "rounded-[22px] bg-background"
        )}
      >
        <div className="flex h-11 items-center">
          <span className="grid size-11 shrink-0 place-items-center">
            <Search className="size-[18px] text-foreground" strokeWidth={1.9} aria-hidden="true" />
          </span>
          <label htmlFor="sidebar-search" className="sr-only">
            Search Rhenko
          </label>
          <span className="min-w-0 flex-1 overflow-hidden">
            <input
              ref={inputRef}
              id="sidebar-search"
              name="q"
              type="search"
              value={text}
              onChange={(event) => setText(event.target.value)}
              onFocus={() => setFocused(true)}
              placeholder="Search"
              autoComplete="off"
              className="h-11 w-full min-w-0 bg-transparent pr-2 text-[15px] outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:appearance-none"
            />
          </span>
          {text ? (
            <button
              type="button"
              aria-label="Clear search"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setText("")
                inputRef.current?.focus()
              }}
              className={cn("mr-1.5 grid size-8 shrink-0 place-items-center rounded-full transition-transform duration-200", SMOOTH)}
            >
              <X className="size-4 text-muted-foreground" aria-hidden="true" />
            </button>
          ) : null}
        </div>

        {/* The list grows with the surface. Unfocused, it has no height and is out of the tab order. */}
        <div className={cn("grid transition-[grid-template-rows] duration-300", SMOOTH, focused ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
          <div className="min-h-0 overflow-hidden">
            <motion.div variants={body} initial="hidden" animate={focused ? "show" : "hidden"} inert={!focused} className="px-2 pt-0.5 pb-2">
              <motion.div variants={list} initial="hidden" animate={focused ? "show" : "hidden"} className="flex flex-col">
                {query ? (
                  <motion.div variants={row}>
                    <SearchRow href={`/search?q=${encodeURIComponent(query)}`} label={`Search for “${query}”`} Icon={Search} />
                  </motion.div>
                ) : null}
                {shown.length > 0 ? (
                  <motion.p variants={row} className="px-3 pt-2 pb-1.5 text-xs font-semibold text-muted-foreground">
                    {query ? "Matching recent searches" : "Recent searches"}
                  </motion.p>
                ) : null}
                {shown.map((item) => (
                  <motion.div key={item} variants={row}>
                    <SearchRow href={`/search?q=${encodeURIComponent(item)}`} label={item} Icon={Clock} />
                  </motion.div>
                ))}
                {!query && shown.length === 0 ? (
                  <motion.p variants={row} className="px-3 py-2 text-sm text-muted-foreground">
                    Search posts and people, or try from:handle.
                  </motion.p>
                ) : null}
              </motion.div>
            </motion.div>
          </div>
        </div>
      </div>
    </form>
  )
}

function SearchRow({ href, label, Icon }: { href: string; label: string; Icon: LucideIcon }) {
  return (
    <Link
      href={href}
      data-search-row
      onMouseDown={(event) => event.preventDefault()}
      className="group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <ArrowUpRight
        aria-hidden="true"
        className={cn(
          "size-4 shrink-0 -translate-x-1 translate-y-1 opacity-0 transition-[opacity,translate] duration-200 group-hover:translate-x-0 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:translate-y-0 group-focus-visible:opacity-100",
          SMOOTH
        )}
      />
    </Link>
  )
}
