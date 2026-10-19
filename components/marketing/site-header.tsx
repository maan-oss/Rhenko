"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { ArrowRight, ChevronDown, Menu, Search, X } from "lucide-react"
import { RhenkoSymbol } from "@/components/brand/symbol"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { SearchDialog } from "@/components/marketing/search-dialog"

// Links for the menus. Each product entry names a section of the landing page; the policy pages sit in their own menu.
const PRODUCT = [
  { label: "Feed you steer", href: "#feed", detail: "Two tabs, Not interested, and what leaves" },
  { label: "Calls", href: "#calls", detail: "Groups of up to six, next to messages" },
  { label: "Circles", href: "#circles", detail: "Open, ask to join, or closed" },
  { label: "How the feed ranks", href: "#ranking", detail: "The candidate pools, in plain numbers" },
  { label: "Features", href: "#features", detail: "Sahayak, polls, drafts, translation" },
]

const TRUST = [
  { label: "Rules", href: "/rules", detail: "What is not allowed, and what happens" },
  { label: "Safety", href: "/safety", detail: "Report a post, protect yourself" },
  { label: "Transparency", href: "/transparency", detail: "Reports, notices and appeals" },
  { label: "Privacy", href: "/privacy", detail: "What is stored, and why" },
]

const MENU_LINKS = [...PRODUCT.map(({ label, href }) => ({ label, href })), ...TRUST.map(({ label, href }) => ({ label, href })), { label: "Advertise", href: "/advertise" }]

const TRIGGER =
  "group inline-flex h-9 items-center gap-1 rounded-full px-3.5 text-[14px] font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-popup-open:text-foreground"

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const sheetRef = useRef<HTMLDivElement>(null)
  const openerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setSearchOpen((open) => !open)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  // The sheet is a modal: it locks the page behind it, closes on Escape, keeps focus inside, and gives focus back to the
  // button that opened it.
  useEffect(() => {
    if (!menuOpen) return
    const opener = openerRef.current
    const { overflow } = document.body.style
    document.body.style.overflow = "hidden"
    const first = sheetRef.current?.querySelector<HTMLElement>("a, button")
    first?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false)
        return
      }
      if (event.key !== "Tab" || !sheetRef.current) return
      const items = Array.from(sheetRef.current.querySelectorAll<HTMLElement>("a, button"))
      if (items.length === 0) return
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === items[0]) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        items[0].focus()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = overflow
      window.removeEventListener("keydown", onKey)
      opener?.focus()
    }
  }, [menuOpen])

  return (
    <>
      <span aria-hidden className="mk-progress pointer-events-none fixed inset-x-0 top-0 z-[60] block h-[2px] origin-left bg-foreground" />
      <header className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center px-3 sm:top-4">
        <nav
          aria-label="Main"
          className={cn(
            "pointer-events-auto flex h-14 w-full max-w-[1120px] items-center gap-2 rounded-full border pr-2 pl-4 transition-[background-color,border-color,box-shadow,backdrop-filter] duration-500 sm:pl-5",
            scrolled
              ? "border-border bg-background/75 shadow-[0_18px_50px_-30px_rgba(10,10,10,0.5)] backdrop-blur-2xl"
              : "border-transparent bg-transparent"
          )}
        >
          <Link href="/" className="flex items-center gap-2.5 rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50" aria-label="Rhenko home">
            <RhenkoSymbol className="size-6" />
            <span className="text-[16px] font-semibold tracking-tight">Rhenko</span>
          </Link>

          <div className="ml-4 hidden items-center gap-0.5 md:flex">
            <DropdownMenu>
              <DropdownMenuTrigger className={TRIGGER}>
                Product
                <ChevronDown className="size-3.5 transition-transform duration-200 group-data-popup-open:rotate-180" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" sideOffset={10} className="w-[300px] rounded-2xl p-2">
                {PRODUCT.map((item) => (
                  <DropdownMenuItem key={item.href} render={<a href={item.href} />} className="flex-col items-start gap-0.5 rounded-xl px-3 py-2.5">
                    <span className="text-[14px] font-semibold">{item.label}</span>
                    <span className="text-[12.5px] text-muted-foreground">{item.detail}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger className={TRIGGER}>
                Trust and safety
                <ChevronDown className="size-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" sideOffset={10} className="w-[300px] rounded-2xl p-2">
                {TRUST.map((item) => (
                  <DropdownMenuItem key={item.href} render={<Link href={item.href} />} className="flex-col items-start gap-0.5 rounded-xl px-3 py-2.5">
                    <span className="text-[14px] font-semibold">{item.label}</span>
                    <span className="text-[12.5px] text-muted-foreground">{item.detail}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Link href="/advertise" className={cn(TRIGGER, "no-underline")}>
              Advertise
            </Link>
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="group hidden h-9 items-center gap-2 rounded-full border border-border bg-background/60 pr-1.5 pl-3 text-[13px] text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 lg:inline-flex"
            >
              <Search className="size-3.5" />
              <span className="w-24 text-left">Search</span>
              <kbd className="rounded-full border border-border px-2 py-0.5 font-sans text-[11px]">Ctrl K</kbd>
            </button>
            <button
              type="button"
              aria-label="Search"
              onClick={() => setSearchOpen(true)}
              className="inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 lg:hidden"
            >
              <Search className="size-[18px]" />
            </button>
            <Link
              href="/login"
              className="hidden h-9 items-center rounded-full px-3.5 text-[14px] font-medium text-foreground/80 transition-colors hover:text-foreground sm:inline-flex"
            >
              Log in
            </Link>
            <Button render={<Link href="/signup" />} size="lg" className="h-9 rounded-full px-4 text-[14px] font-semibold">
              Create account
            </Button>
            <button
              ref={openerRef}
              type="button"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              aria-controls="site-sheet"
              onClick={() => setMenuOpen((open) => !open)}
              className="inline-flex size-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-foreground/5 md:hidden"
            >
              {menuOpen ? <X className="size-[18px]" /> : <Menu className="size-[18px]" />}
            </button>
          </div>
        </nav>
      </header>

      <AnimatePresence>
        {menuOpen ? (
          <motion.div
            key="sheet"
            id="site-sheet"
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="Site menu"
            className="fixed inset-0 z-[55] flex flex-col overflow-y-auto bg-background/97 backdrop-blur-2xl md:hidden"
            initial={{ y: "-100%" }}
            animate={{ y: 0 }}
            exit={{ y: "-100%" }}
            transition={{ duration: 0.55, ease: [0.76, 0, 0.24, 1] }}
          >
            <div className="flex h-16 items-center justify-between px-5">
              <span className="flex items-center gap-2.5">
                <RhenkoSymbol className="size-6" />
                <span className="text-[16px] font-semibold tracking-tight">Rhenko</span>
              </span>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
                className="inline-flex size-10 items-center justify-center rounded-full border border-border"
              >
                <X className="size-[18px]" />
              </button>
            </div>
            <nav aria-label="Menu" className="grid gap-1 px-5 pt-4 pb-8">
              {MENU_LINKS.map((item, index) => (
                <motion.div
                  key={item.href}
                  initial={{ opacity: 0, y: 22, filter: "blur(6px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={{ delay: 0.12 + index * 0.04, duration: 0.5, ease: "easeOut" }}
                >
                  <Link
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className="group flex items-center justify-between rounded-2xl px-3 py-2.5 text-[22px] font-semibold tracking-tight transition-colors hover:bg-foreground/5"
                  >
                    {item.label}
                    <ArrowRight className="size-5 -translate-x-2 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100" />
                  </Link>
                </motion.div>
              ))}
            </nav>
            <div className="mt-auto grid gap-3 border-t border-border px-5 py-6">
              <Button render={<Link href="/signup" />} size="lg" className="h-12 rounded-full text-[15px] font-semibold">
                Create account
              </Button>
              <Link href="/login" onClick={() => setMenuOpen(false)} className="inline-flex h-12 items-center justify-center rounded-full border border-border text-[15px] font-medium">
                Log in
              </Link>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  )
}
