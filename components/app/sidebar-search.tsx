"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { ArrowUpRight, Clock, Search, X } from "lucide-react"
import { cn } from "@/lib/utils"

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

const list = { hidden: {}, show: { transition: { staggerChildren: 0.045, delayChildren: 0.06 } } }
const rise = { hidden: { opacity: 0, y: -8 }, show: { opacity: 1, y: 0, transition: { duration: 0.24, ease: EASE } } }

type Props = {
  recent: string[]
  collapsed: boolean
  onExpand: () => void
}

// The field sits in a pill. Focusing it drops a rounded card from the field, the way the
// America.gov menu opens, and the recent searches arrive one after another. In a collapsed
// rail a click opens the rail first, then the field.
export function SidebarSearch({ recent, collapsed, onExpand }: Props) {
  const [focused, setFocused] = useState(false)
  const [text, setText] = useState("")
  const [wantFocus, setWantFocus] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

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

  const open = focused && !collapsed && recent.length > 0

  return (
    <form
      action="/search"
      role="search"
      className="relative w-full"
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
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setFocused(false)
                  event.currentTarget.blur()
                }
              }}
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
            key="recent"
            initial={{ opacity: 0, scale: 0.94, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -6, transition: { duration: 0.16, ease: EASE } }}
            transition={{ duration: 0.3, ease: EASE }}
            style={{ transformOrigin: "top left" }}
            className="absolute top-full left-0 z-40 mt-2 w-full overflow-hidden rounded-[26px] bg-popover p-2 shadow-[0_24px_60px_-18px_rgba(31,29,26,0.32)] ring-1 ring-border [corner-shape:squircle] dark:shadow-[0_24px_60px_-18px_rgba(0,0,0,0.7)]"
          >
            <p className="px-3 pt-2 pb-1.5 text-xs font-semibold text-muted-foreground">Recent searches</p>
            <motion.ul variants={list} initial="hidden" animate="show">
              {recent.slice(0, 6).map((query) => (
                <motion.li key={query} variants={rise}>
                  <Link
                    href={`/search?q=${encodeURIComponent(query)}`}
                    onMouseDown={(event) => event.preventDefault()}
                    className="group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Clock className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{query}</span>
                    <ArrowUpRight
                      aria-hidden="true"
                      className="size-4 shrink-0 -translate-x-1 translate-y-1 opacity-0 transition-[opacity,translate] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-0 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:translate-y-0 group-focus-visible:opacity-100"
                    />
                  </Link>
                </motion.li>
              ))}
            </motion.ul>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </form>
  )
}
