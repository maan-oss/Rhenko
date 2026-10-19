"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { ArrowUpRight, ChevronDown, Menu, X } from "lucide-react"
import { RhenkoSymbol } from "@/components/brand/symbol"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

// Links for the menus. Each product entry names a section of the landing page; the policy pages sit in their own menu.
const PRODUCT = [
  { label: "Feed you steer", href: "#feed", detail: "Two tabs, Not interested, and what leaves" },
  { label: "Calls", href: "#calls", detail: "Groups of up to six, next to messages" },
  { label: "Circles", href: "#circles", detail: "Open, ask to join, or closed" },
  { label: "How the feed ranks", href: "#ranking", detail: "The candidate pools, in plain numbers" },
  { label: "Features", href: "#features", detail: "Polls, drafts, passkeys and translation" },
]

const TRUST = [
  { label: "Rules", href: "/rules", detail: "What is not allowed, and what happens" },
  { label: "Safety", href: "/safety", detail: "Report a post, protect yourself" },
  { label: "Transparency", href: "/transparency", detail: "Reports, notices and appeals" },
  { label: "Privacy", href: "/privacy", detail: "What is stored, and why" },
]

const BUSINESS = [{ label: "Advertise", href: "/advertise", detail: "" }]

const GROUPS = [
  { label: "Product", items: PRODUCT },
  { label: "Trust and safety", items: TRUST },
  { label: "For business", items: BUSINESS },
]

const TRIGGER =
  "group inline-flex h-9 items-center gap-1 rounded-full px-3.5 text-[14px] font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-popup-open:text-foreground"

const ICON_BUTTON =
  "inline-flex size-10 items-center justify-center rounded-full text-foreground outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 [-webkit-tap-highlight-color:transparent]"

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const sheetRef = useRef<HTMLDivElement>(null)
  const openerRef = useRef<HTMLButtonElement>(null)
  const closedByKey = useRef(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  // The menu is a modal: it locks the page behind it, closes on Escape, and keeps Tab inside. It takes focus without
  // ringing anything, so a tap never leaves an outline behind. Only a keyboard close hands focus back to the button.
  useEffect(() => {
    if (!menuOpen) return
    const opener = openerRef.current
    const { overflow } = document.body.style
    document.body.style.overflow = "hidden"
    sheetRef.current?.focus({ preventScroll: true })
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closedByKey.current = true
        setMenuOpen(false)
        return
      }
      if (event.key !== "Tab" || !sheetRef.current) return
      const items = Array.from(sheetRef.current.querySelectorAll<HTMLElement>("a[href], button"))
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && (document.activeElement === first || document.activeElement === sheetRef.current)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = overflow
      window.removeEventListener("keydown", onKey)
      if (closedByKey.current) {
        closedByKey.current = false
        opener?.focus({ preventScroll: true })
      }
    }
  }, [menuOpen])

  const close = () => setMenuOpen(false)

  return (
    <>
      {/* On a phone the bar is always clear, so the page shows through it. From the medium width up it turns to glass once
          the page moves. */}
      <header className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center px-3 sm:top-4">
        <nav
          aria-label="Main"
          className={cn(
            "pointer-events-auto flex h-14 w-full max-w-[1120px] items-center gap-2 rounded-full border border-transparent bg-transparent pr-2 pl-4 transition-[background-color,border-color,box-shadow,backdrop-filter] duration-500 sm:pl-5",
            scrolled && "md:border-border md:bg-background/75 md:shadow-[0_18px_50px_-30px_rgba(10,10,10,0.5)] md:backdrop-blur-2xl"
          )}
        >
          <Link
            href="/"
            className="flex items-center gap-2.5 rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [-webkit-tap-highlight-color:transparent]"
            aria-label="Rhenko home"
          >
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

          <div className="ml-auto flex items-center gap-1">
            <Link
              href="/login"
              className="hidden h-9 items-center rounded-full px-3.5 text-[14px] font-medium text-foreground/80 transition-colors hover:text-foreground md:inline-flex"
            >
              Log in
            </Link>
            <Button render={<Link href="/signup" />} size="lg" className="hidden h-9 rounded-full px-4 text-[14px] font-semibold md:inline-flex">
              Create account
            </Button>
            <button
              ref={openerRef}
              type="button"
              aria-label="Open menu"
              aria-expanded={menuOpen}
              aria-controls="site-sheet"
              onClick={() => setMenuOpen(true)}
              className={cn(ICON_BUTTON, "md:hidden")}
            >
              <Menu className="size-[21px]" />
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
            tabIndex={-1}
            className="fixed inset-0 z-[55] flex flex-col overflow-y-auto overscroll-contain bg-background outline-none md:hidden"
            initial={{ clipPath: "inset(0% 0% 100% 0% round 0px)" }}
            animate={{ clipPath: "inset(0% 0% 0% 0% round 0px)" }}
            exit={{ clipPath: "inset(0% 0% 100% 0% round 0px)" }}
            transition={{ duration: 0.6, ease: [0.76, 0, 0.24, 1] }}
          >
            <div className="mx-3 mt-3 flex h-14 shrink-0 items-center justify-between pr-2 pl-4">
              <Link
                href="/"
                onClick={close}
                className="flex items-center gap-2.5 rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [-webkit-tap-highlight-color:transparent]"
              >
                <RhenkoSymbol className="size-6" />
                <span className="text-[16px] font-semibold tracking-tight">Rhenko</span>
              </Link>
              <button type="button" onClick={close} aria-label="Close menu" className={ICON_BUTTON}>
                <X className="size-[21px]" />
              </button>
            </div>

            <div className="flex flex-1 flex-col gap-8 px-6 pt-8 pb-8">
              <motion.p
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12, duration: 0.5, ease: [0.2, 0.7, 0.2, 1] }}
                className="text-[17px] leading-snug font-medium tracking-[-0.01em] text-balance"
              >
                Public conversation, on your terms.
              </motion.p>

              {GROUPS.map((group, groupIndex) => (
                <nav key={group.label} aria-label={group.label} className="grid gap-3">
                  <p className="text-[13px] font-medium text-muted-foreground">{group.label}</p>
                  <ul className="grid">
                    {group.items.map((item, index) => (
                      <motion.li
                        key={item.href}
                        initial={{ opacity: 0, y: 18 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.18 + (groupIndex * 4 + index) * 0.045, duration: 0.5, ease: [0.2, 0.7, 0.2, 1] }}
                      >
                        <Link
                          href={item.href}
                          onClick={close}
                          className="group flex items-center justify-between gap-4 border-t border-border py-3.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [-webkit-tap-highlight-color:transparent]"
                        >
                          <span className="grid gap-1">
                            <span className="text-[24px] leading-tight font-semibold tracking-[-0.025em]">{item.label}</span>
                            {item.detail ? <span className="text-[13.5px] leading-snug text-muted-foreground">{item.detail}</span> : null}
                          </span>
                          <ArrowUpRight className="size-[18px] shrink-0 text-muted-foreground transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
                        </Link>
                      </motion.li>
                    ))}
                  </ul>
                </nav>
              ))}
            </div>

            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5, ease: [0.2, 0.7, 0.2, 1] }}
              className="sticky bottom-0 mt-auto grid gap-3 border-t border-border bg-background px-6 pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
            >
              <Button render={<Link href="/signup" onClick={close} />} size="lg" className="h-12 w-full rounded-full text-[15px] font-semibold">
                Create an account
              </Button>
              <Link
                href="/login"
                onClick={close}
                className="inline-flex h-12 items-center justify-center rounded-full border border-border text-[15px] font-medium outline-none transition-colors hover:bg-foreground/5 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                Log in
              </Link>
              <p className="pt-1 text-center text-[12.5px] text-muted-foreground">Accounts are for people 18 and older.</p>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  )
}
