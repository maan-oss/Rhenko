"use client"

import Link from "next/link"
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react"
import { AnimatePresence, motion } from "motion/react"
import { ArrowUpRight, Clock, Search, X, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

// Timings measured on the America.gov menu. The card fades in after a short beat, the rows
// fade up one after another in a 35ms stagger over 480ms, and nothing moves on the way in.
type Curve = [number, number, number, number]
const STANDARD: Curve = [0.4, 0, 0.2, 1]
const DECELERATE: Curve = [0.22, 0, 0.2, 1]

const card = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.16, delay: 0.1, ease: STANDARD } },
  exit: { opacity: 0, transition: { duration: 0.12, ease: STANDARD } },
}
const list = {
  hidden: {},
  show: { transition: { delayChildren: 0.175, staggerChildren: 0.035 } },
}
const row = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.48, ease: DECELERATE } },
}

type Props = {
  recent: string[]
  collapsed: boolean
  onExpand: () => void
}

// The field sits in a pill. Clicking or focusing it opens a card under it, the way the
// America.gov menu opens. A collapsed rail opens first, then the field.
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
  const shown = matches.slice(0, 6)

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

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    if (!query) event.preventDefault()
  }

  return (
    <form
      ref={formRef}
      action="/search"
      role="search"
      className="relative w-full"
      onSubmit={onSubmit}
      onKeyDown={onKeyDown}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false)
      }}
    >
      <div
        onClick={activate}
        className={cn(
          "flex h-11 w-full cursor-text items-center rounded-full bg-background ring-1 transition-[box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          focused && !collapsed ? "ring-foreground/40" : "ring-border"
        )}
      >
        <span className="grid size-11 shrink-0 place-items-center">
          <Search className="size-[18px] text-foreground" strokeWidth={1.9} aria-hidden="true" />
        </span>
        <label htmlFor="sidebar-search" className="sr-only">
          Search Rhenko
        </label>
        <span
          className={cn(
            "grid min-w-0 flex-1 transition-[grid-template-columns] duration-[380ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
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
            className="mr-1.5 grid size-8 shrink-0 place-items-center rounded-full transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-110 active:scale-95"
          >
            <X className="size-4 text-muted-foreground" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <AnimatePresence>
        {open ? (
          <motion.div
            key="card"
            variants={card}
            initial="hidden"
            animate="show"
            exit="exit"
            className="absolute top-full left-0 z-40 mt-2 w-full overflow-hidden rounded-[26px] bg-popover p-2 shadow-[0_24px_60px_-18px_rgba(31,29,26,0.32)] ring-1 ring-border [corner-shape:superellipse(1.3)] dark:shadow-[0_24px_60px_-18px_rgba(0,0,0,0.7)]"
          >
            <motion.div variants={list} initial="hidden" animate="show" className="flex flex-col">
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
        ) : null}
      </AnimatePresence>
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
      <Icon className={cn("size-4 shrink-0 text-muted-foreground")} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <ArrowUpRight
        aria-hidden="true"
        className="size-4 shrink-0 -translate-x-1 translate-y-1 opacity-0 transition-[opacity,translate] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-0 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:translate-y-0 group-focus-visible:opacity-100"
      />
    </Link>
  )
}
