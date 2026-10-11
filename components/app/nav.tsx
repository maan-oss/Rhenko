"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion } from "motion/react"
import { BellIcon, BookmarkIcon, HomeIcon, MessageCircleIcon, SearchIcon, SettingsIcon, UserIcon } from "lucide-animated"
import { cn } from "@/lib/utils"

type IconType = React.ComponentType<{ size?: number; className?: string }>

type Item = {
  href: string
  label: string
  Icon: IconType
  badge?: number
  active: (path: string) => boolean
}

function buildItems(handle: string, notifications: number, messages: number): Item[] {
  return [
    { href: "/", label: "Home", Icon: HomeIcon, active: (p) => p === "/" },
    { href: "/explore", label: "Explore", Icon: SearchIcon, active: (p) => p.startsWith("/explore") },
    { href: "/notifications", label: "Notifications", Icon: BellIcon, badge: notifications, active: (p) => p.startsWith("/notifications") },
    { href: "/messages", label: "Messages", Icon: MessageCircleIcon, badge: messages, active: (p) => p.startsWith("/messages") },
    { href: "/bookmarks", label: "Bookmarks", Icon: BookmarkIcon, active: (p) => p.startsWith("/bookmarks") },
    { href: `/${handle}`, label: "Profile", Icon: UserIcon, active: (p) => p === `/${handle}` },
    { href: "/settings", label: "Settings", Icon: SettingsIcon, active: (p) => p.startsWith("/settings") },
  ]
}

function Badge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-dusk px-1.5 text-[11px] font-semibold text-background tabular-nums">
      {count > 99 ? "99+" : count}
    </span>
  )
}

export function NavRail({ handle, notifications, messages }: { handle: string; notifications: number; messages: number }) {
  const path = usePathname()
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {buildItems(handle, notifications, messages).map(({ href, label, Icon, badge, active }) => {
        const isActive = active(path)
        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex items-center gap-4 rounded-full px-4 py-3 text-[18px] transition-colors hover:bg-muted",
              isActive ? "font-bold" : "font-normal"
            )}
          >
            <Icon size={24} />
            <span>{label}</span>
            <Badge count={badge ?? 0} />
          </Link>
        )
      })}
    </nav>
  )
}

export function MobileTabBar({ handle, notifications, messages }: { handle: string; notifications: number; messages: number }) {
  const path = usePathname()
  const items = buildItems(handle, notifications, messages).filter((i) => !["Bookmarks", "Settings"].includes(i.label))
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur xl:hidden">
      <ul className="mx-auto grid max-w-[600px] grid-cols-5">
        {items.map(({ href, label, Icon, badge, active }) => {
          const isActive = active(path)
          return (
            <li key={href} className="relative">
              <Link
                href={href}
                aria-label={label}
                aria-current={isActive ? "page" : undefined}
                className={cn("relative flex h-14 items-center justify-center", isActive ? "text-foreground" : "text-muted-foreground")}
              >
                {isActive ? (
                  <motion.span
                    layoutId="mobile-tab"
                    className="absolute inset-x-6 top-0 h-[3px] bg-dusk"
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  />
                ) : null}
                <Icon size={24} />
                {badge && badge > 0 ? (
                  <span className="absolute top-2 left-1/2 ml-2 grid h-4 min-w-4 place-items-center rounded-full bg-dusk px-1 text-[10px] font-semibold text-background">
                    {badge > 9 ? "9+" : badge}
                  </span>
                ) : null}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
