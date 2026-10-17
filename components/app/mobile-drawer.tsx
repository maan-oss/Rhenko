"use client"

import Link from "next/link"
import { useEffect, useRef } from "react"
import { AnimatePresence, motion } from "motion/react"
import { X } from "lucide-react"
import { buildItems } from "@/components/app/nav"
import { SidebarFooter, type FooterViewer } from "@/components/app/sidebar-footer"
import { RhenkoSymbol } from "@/components/brand/symbol"
import type { AccountSummary } from "@/lib/auth"
import { cn } from "@/lib/utils"

// The left panel on phones. It slides over the page from the left, and its rounded edge
// overlaps the content. It is opaque. It closes on the scrim, the close button, Escape, or a swipe left.
const EASE = [0.22, 1, 0.36, 1] as const

type Props = {
  open: boolean
  onClose: () => void
  viewer: FooterViewer
  accounts: AccountSummary[]
  path: string
  notifications: number
  messages: number
}

export function MobileDrawer({ open, onClose, viewer, accounts, path, notifications, messages }: Props) {
  const panelRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener("keydown", onKey)
    }
  }, [open, onClose])

  // A swipe left across the panel closes it. Touch events, not a drag: the browser cancels a pointer
  // once a sideways pan starts, but the touch moves keep arriving, so the swipe reads all the way across.
  useEffect(() => {
    if (!open) return
    let startX = 0
    let startY = 0
    let tracking = false
    function down(event: TouchEvent) {
      const touch = event.touches[0]
      const panel = panelRef.current
      if (!touch || event.touches.length > 1 || !panel || !panel.contains(event.target as Node)) return
      startX = touch.clientX
      startY = touch.clientY
      tracking = true
    }
    function move(event: TouchEvent) {
      const touch = event.touches[0]
      if (!tracking || !touch) return
      const dx = touch.clientX - startX
      const dy = touch.clientY - startY
      if (Math.abs(dy) > 40 && Math.abs(dy) > Math.abs(dx)) {
        tracking = false
        return
      }
      if (dx < -64) {
        tracking = false
        onClose()
      }
    }
    function up() {
      tracking = false
    }
    window.addEventListener("touchstart", down, { passive: true })
    window.addEventListener("touchmove", move, { passive: true })
    window.addEventListener("touchend", up, { passive: true })
    window.addEventListener("touchcancel", up, { passive: true })
    return () => {
      window.removeEventListener("touchstart", down)
      window.removeEventListener("touchmove", move)
      window.removeEventListener("touchend", up)
      window.removeEventListener("touchcancel", up)
    }
  }, [open, onClose])

  const rows = buildItems(notifications, messages)

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            key="scrim"
            type="button"
            aria-label="Dismiss menu"
            tabIndex={-1}
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-40 bg-foreground/25 backdrop-blur-[2px] lg:hidden"
          />
          <motion.aside
            key="panel"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            initial={{ x: "-110%" }}
            animate={{ x: 0 }}
            exit={{ x: "-110%" }}
            transition={{ duration: 0.42, ease: EASE }}
            className="fixed top-2 bottom-2 left-2 z-50 flex w-[min(84vw,330px)] flex-col overflow-hidden rounded-[32px] bg-sidebar p-4 shadow-[var(--depth-float)] lg:hidden"
          >
            <div className="flex h-11 items-center justify-between">
              <span className="grid size-11 place-items-center">
                <RhenkoSymbol className="size-7" />
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close menu"
                  title="Close menu"
                  className="grid size-9 place-items-center rounded-full text-foreground transition-colors hover:bg-foreground/5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="size-5" strokeWidth={1.8} aria-hidden="true" />
                </button>
              </div>
            </div>

            <nav aria-label="Menu" className="mt-5 min-h-0 flex-1 overflow-y-auto">
              <ul className="flex flex-col gap-1">
                {rows.map((item) => {
                  const active = item.active(path)
                  const count = item.badge ?? 0
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onClose}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex h-12 items-center gap-3 rounded-2xl px-3 text-[16px] transition-colors duration-200 hover:bg-foreground/5",
                          active ? "bg-dusk/12 font-semibold" : "font-medium"
                        )}
                      >
                        <item.Icon
                          className={cn("size-[22px] shrink-0", active && "text-dusk")}
                          strokeWidth={active ? 2.1 : 1.75}
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        {count > 0 ? (
                          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-dusk px-1.5 text-[11px] font-semibold tabular-nums text-background">
                            {count > 99 ? "99+" : count}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </nav>

            <div className="mt-4 border-t border-border pt-4">
              <SidebarFooter viewer={viewer} accounts={accounts} onNavigate={onClose} />
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  )
}
