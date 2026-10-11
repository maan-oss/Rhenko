"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { motion } from "motion/react"
import { Bell, Bookmark, ChartNoAxesColumn, FileText, House, List, MessageCircle, Search } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Avatar, type AvatarUser } from "@/components/app/avatar"
import { MobileDrawer } from "@/components/app/mobile-drawer"
import type { AccountSummary } from "@/lib/auth"
import { cn } from "@/lib/utils"

export type NavItemConfig = {
  href: string
  label: string
  Icon: LucideIcon
  badge?: number
  // The active icon fills in, so the current section reads without a background behind it.
  filled: boolean
  active: (path: string) => boolean
  mobile: boolean
}

// The sidebar and the phone panel keep every section. The glass dock on phones keeps the ones used most.
export function buildItems(notifications: number, messages: number): NavItemConfig[] {
  return [
    { href: "/", label: "Home", Icon: House, filled: true, active: (p) => p === "/", mobile: true },
    { href: "/explore", label: "Explore", Icon: Search, filled: false, active: (p) => p.startsWith("/explore") || p.startsWith("/search") || p.startsWith("/topics"), mobile: true },
    { href: "/notifications", label: "Notifications", Icon: Bell, badge: notifications, filled: true, active: (p) => p.startsWith("/notifications"), mobile: true },
    { href: "/messages", label: "Messages", Icon: MessageCircle, badge: messages, filled: true, active: (p) => p.startsWith("/messages"), mobile: true },
    { href: "/bookmarks", label: "Bookmarks", Icon: Bookmark, filled: true, active: (p) => p.startsWith("/bookmarks"), mobile: true },
    { href: "/lists", label: "Lists", Icon: List, filled: false, active: (p) => p.startsWith("/lists"), mobile: false },
    { href: "/drafts", label: "Drafts", Icon: FileText, filled: false, active: (p) => p.startsWith("/drafts"), mobile: false },
    { href: "/analytics", label: "Analytics", Icon: ChartNoAxesColumn, filled: false, active: (p) => p.startsWith("/analytics"), mobile: false },
  ]
}

// The glass dock along the bottom of phones. The avatar opens the left panel, which also opens on a swipe from the left edge.
export function MobileTabBar({
  viewer,
  accounts,
  notifications,
  messages,
}: {
  viewer: AvatarUser & { handle: string; status?: string | null }
  accounts: AccountSummary[]
  notifications: number
  messages: number
}) {
  const path = usePathname()
  const [open, setOpen] = useState(false)
  const items = buildItems(notifications, messages).filter((item) => item.mobile)

  // Touch events, not pointer events: the browser cancels a pointer once a sideways pan starts,
  // but the touch moves keep arriving, so the swipe still reads all the way across.
  useEffect(() => {
    let startX = 0
    let startY = 0
    let tracking = false
    function down(event: TouchEvent) {
      const touch = event.touches[0]
      if (!touch || event.touches.length > 1 || touch.clientX > 24) return
      startX = touch.clientX
      startY = touch.clientY
      tracking = true
    }
    function move(event: TouchEvent) {
      const touch = event.touches[0]
      if (!tracking || !touch) return
      if (Math.abs(touch.clientY - startY) > 40) {
        tracking = false
        return
      }
      if (touch.clientX - startX > 64) {
        tracking = false
        setOpen(true)
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
  }, [])

  return (
    <>
      <nav aria-label="Main" className="fixed inset-x-4 bottom-[max(16px,env(safe-area-inset-bottom))] z-30 lg:hidden">
        <ul className="glass mx-auto flex max-w-[440px] items-center justify-between rounded-[30px] p-1.5">
          {items.map(({ href, label, Icon, badge, active }) => {
            const isActive = active(path)
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-label={label}
                  aria-current={isActive ? "page" : undefined}
                  className="relative grid size-12 place-items-center rounded-full transition-colors duration-200 hover:bg-foreground/5"
                >
                  {isActive ? (
                    <motion.span
                      layoutId="mobile-dock-pill"
                      className="metal absolute inset-0 rounded-full"
                      transition={{ type: "spring", stiffness: 500, damping: 38 }}
                    />
                  ) : null}
                  <Icon className={cn("relative size-[22px]", isActive ? "text-[var(--metal-text)]" : "text-foreground/80")} strokeWidth={isActive ? 2.2 : 1.75} aria-hidden="true" />
                  {badge && badge > 0 ? (
                    <span className="metal absolute top-0.5 right-0.5 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-semibold">
                      {badge > 9 ? "9+" : badge}
                    </span>
                  ) : null}
                </Link>
              </li>
            )
          })}
          <li>
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Open menu"
              aria-expanded={open}
              aria-haspopup="dialog"
              className="grid size-12 place-items-center rounded-full transition-colors duration-200 hover:bg-foreground/5"
            >
              <Avatar user={viewer} size={32} />
            </button>
          </li>
        </ul>
      </nav>
      <MobileDrawer
        open={open}
        onClose={() => setOpen(false)}
        viewer={viewer}
        accounts={accounts}
        path={path}
        notifications={notifications}
        messages={messages}
      />
    </>
  )
}
