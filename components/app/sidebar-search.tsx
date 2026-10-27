"use client"

import Link from "@/components/app/link"
import { useEffect, useRef, useState, type KeyboardEvent } from "react"
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

type Props = {
  recent: string[]
  collapsed: boolean
  onExpand: () => void
}

// The field and its card are one surface. The field is a pill. Opening it, the same surface
// grows downward to hold the recent searches, and sits over the nav without pushing it.
export function SidebarSearch({ recent, collapsed, onExpand }: Props) {
  const [focused, setFocused] = useState(false)
  const [text, setText] = useState("")
  const [wantFocus, setWantFocus] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (collapsed || !wantFocus) return
    // Wait for the rail to finish opening, so the field has room to take focus.
    const timer = window.setTimeout(() => {
      inputRef.current?.focus()
      setWantFocus(false)
    }, 260)
    return () => window.clearTimeout(timer)
  }, [collapsed, wantFocus])

  function activate() {
    if (collapsed) {
      setWantFocus(true)
      onExpand()
      return
    }
    inputRef.current?.focus()
  }

  const open = focused && !collapsed
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
    if (event.key === "ArrowDown" && open && event.target === inputRef.current) {
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
        onClick={activate}
        className={cn(
          "absolute inset-x-0 top-0 z-40 cursor-text overflow-hidden ring-1 ring-border transition-[box-shadow,border-radius,background-color] duration-300 focus-within:ring-foreground/40",
          SMOOTH,
          open
            ? "rounded-[26px] bg-popover shadow-[0_24px_60px_-18px_rgba(31,29,26,0.32)] dark:shadow-[0_24px_60px_-18px_rgba(0,0,0,0.7)]"
            : "rounded-[22px] bg-background"
        )}
      >
        <div className="flex h-11 items-center">
          <span className="grid size-11 shrink-0 place-items-center">
            <Search className="size-[18px] text-foreground" strokeWidth={1.9} aria-hidden="true" />
          </span>
          <label htmlFor="sidebar-search" className="sr-only">
            Search Rhenko
          </label>
          <span
            className={cn(
              "grid min-w-0 flex-1 transition-[grid-template-columns] duration-[380ms]",
              SMOOTH,
              collapsed ? "grid-cols-[0fr]" : "grid-cols-[1fr]"
            )}
          >
            <span className="min-w-0 overflow-hidden">
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
                tabIndex={collapsed ? -1 : 0}
                className="h-11 w-full min-w-0 bg-transparent pr-2 text-[15px] outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:appearance-none"
              />
            </span>
          </span>
          {text && !collapsed ? (
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

        {/* The list grows with the surface. Closed, it has no height and is out of the tab order. */}
        <div className={cn("grid transition-[grid-template-rows] duration-300", SMOOTH, open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
          <div className="min-h-0 overflow-hidden">
            <motion.div variants={body} initial="hidden" animate={open ? "show" : "hidden"} inert={!open} className="px-2 pt-0.5 pb-2">
              <motion.div variants={list} initial="hidden" animate={open ? "show" : "hidden"} className="flex flex-col">
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
