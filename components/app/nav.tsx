"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion } from "motion/react"
import { Bell, Bookmark, House, List, MessageCircle, Search } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Avatar, type AvatarUser } from "@/components/app/avatar"
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

// The sidebar keeps every section. The bottom bar on phones keeps the five used most.
export function buildItems(notifications: number, messages: number): NavItemConfig[] {
  return [
    { href: "/", label: "Home", Icon: House, filled: true, active: (p) => p === "/", mobile: true },
    { href: "/explore", label: "Explore", Icon: Search, filled: false, active: (p) => p.startsWith("/explore") || p.startsWith("/search") || p.startsWith("/topics"), mobile: true },
    { href: "/notifications", label: "Notifications", Icon: Bell, badge: notifications, filled: true, active: (p) => p.startsWith("/notifications"), mobile: true },
    { href: "/messages", label: "Messages", Icon: MessageCircle, badge: messages, filled: true, active: (p) => p.startsWith("/messages"), mobile: true },
    { href: "/bookmarks", label: "Bookmarks", Icon: Bookmark, filled: true, active: (p) => p.startsWith("/bookmarks"), mobile: true },
    { href: "/lists", label: "Lists", Icon: List, filled: false, active: (p) => p.startsWith("/lists"), mobile: false },
  ]
}

export function MobileTabBar({
  viewer,
  notifications,
  messages,
}: {
  viewer: AvatarUser & { handle: string }
  notifications: number
  messages: number
}) {
  const path = usePathname()
  const items = buildItems(notifications, messages).filter((item) => item.mobile)
  return (
    <nav aria-label="Main" className="fixed inset-x-3 bottom-3 z-30 lg:hidden">
      <ul className="mx-auto flex max-w-[460px] items-center justify-between gap-1 rounded-full border border-border bg-background/90 p-1.5 shadow-lg backdrop-blur-md">
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
                    layoutId="mobile-pill"
                    className="absolute inset-0 rounded-full bg-foreground"
                    transition={{ type: "spring", stiffness: 500, damping: 38 }}
                  />
                ) : null}
                <Icon className={cn("relative size-[22px]", isActive ? "text-background" : "text-foreground/80")} strokeWidth={isActive ? 2.25 : 1.75} aria-hidden="true" />
                {badge && badge > 0 ? (
                  <span className="absolute top-1 right-1 grid h-4 min-w-4 place-items-center rounded-full bg-foreground px-1 text-[10px] font-semibold text-background">
                    {badge > 9 ? "9+" : badge}
                  </span>
                ) : null}
                <span className="sr-only">{label}</span>
              </Link>
            </li>
          )
        })}
        <li>
          <Link
            href="/settings"
            aria-label="Account and settings"
            className="grid size-12 place-items-center rounded-full transition-colors duration-200 hover:bg-foreground/5"
          >
            <Avatar user={viewer} size={32} />
          </Link>
        </li>
      </ul>
    </nav>
  )
}
