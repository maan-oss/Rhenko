"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { motion } from "motion/react"
import { PanelLeftClose, PanelLeftOpen, PenLine } from "lucide-react"
import { Avatar, type AvatarUser } from "@/components/app/avatar"
import { buildItems, type NavItemConfig } from "@/components/app/nav"
import { SidebarSearch } from "@/components/app/sidebar-search"
import { RhenkoSymbol } from "@/components/brand/symbol"
import { SIDEBAR_COOKIE } from "@/lib/sidebar"
import { cn } from "@/lib/utils"

const OPEN_WIDTH = 264
const CLOSED_WIDTH = 72
const EASE = "ease-[cubic-bezier(0.22,1,0.36,1)]"
// Labels collapse to zero width in their own grid track, so the rail never reflows text.
const LABEL_TRACK = `grid min-w-0 flex-1 transition-[grid-template-columns] duration-[380ms] ${EASE}`

export type SidebarViewer = AvatarUser & { handle: string; status: string | null }

type Props = {
  viewer: SidebarViewer
  recent: string[]
  notifications: number
  messages: number
  initialCollapsed: boolean
}

// One full-height surface. No card, no gaps, no curve. The main column sits on top of its
// edge, so the sidebar reads as the layer behind it.
export function SidebarPanel({ viewer, recent, notifications, messages, initialCollapsed }: Props) {
  const [collapsed, setCollapsed] = useState(initialCollapsed)
  const path = usePathname()

  function save(next: boolean) {
    setCollapsed(next)
    try {
      document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "open"}; path=/; max-age=31536000; samesite=lax`
    } catch {
      // Cookies can be blocked. The rail still works for this visit.
    }
  }

  return (
    <aside
      style={{ width: collapsed ? CLOSED_WIDTH : OPEN_WIDTH }}
      className={cn("sticky top-0 hidden h-dvh shrink-0 bg-sidebar transition-[width] duration-[380ms] lg:flex", EASE)}
    >
      {/* A short shade on the rail's right edge, where the main column sits in front of it. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 w-3 bg-[linear-gradient(to_left,rgba(31,29,26,0.05),transparent)] dark:bg-[linear-gradient(to_left,rgba(0,0,0,0.3),transparent)]"
      />
      <div className="flex h-full w-full flex-col justify-between px-3.5 py-4">
        <div className="flex flex-col gap-5">
          <Brand collapsed={collapsed} onToggle={() => save(!collapsed)} />
          <SidebarSearch recent={recent} collapsed={collapsed} onExpand={() => save(false)} />
          <SidebarNav path={path} notifications={notifications} messages={messages} collapsed={collapsed} />
        </div>
        <div className="flex flex-col gap-3">
          <ComposeLink collapsed={collapsed} />
          <AccountLink viewer={viewer} collapsed={collapsed} />
        </div>
      </div>
    </aside>
  )
}

// The logo becomes the toggle on hover or focus. Clicking it opens or closes the rail.
function Brand({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const Toggle = collapsed ? PanelLeftOpen : PanelLeftClose
  const label = collapsed ? "Open sidebar" : "Close sidebar"
  return (
    <div className="flex h-11 items-center">
      <button
        type="button"
        onClick={onToggle}
        aria-label={label}
        aria-expanded={!collapsed}
        title={label}
        className="group/brand relative grid size-11 shrink-0 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <RhenkoSymbol
          className={cn(
            "size-7 transition-[opacity,scale] duration-300 group-hover/brand:scale-75 group-hover/brand:opacity-0 group-focus-visible/brand:scale-75 group-focus-visible/brand:opacity-0",
            EASE
          )}
        />
        <Toggle
          className={cn(
            "absolute size-[22px] scale-75 text-foreground opacity-0 transition-[opacity,scale] duration-300 group-hover/brand:scale-100 group-hover/brand:opacity-100 group-focus-visible/brand:scale-100 group-focus-visible/brand:opacity-100",
            EASE
          )}
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </button>
    </div>
  )
}

function SidebarNav({
  path,
  notifications,
  messages,
  collapsed,
}: {
  path: string
  notifications: number
  messages: number
  collapsed: boolean
}) {
  const items = buildItems(notifications, messages)
  const current = items.find((item) => item.active(path))?.href
  return (
    <nav aria-label="Main">
      <ul className="flex flex-col gap-1">
        {items.map((item) => (
          <NavItem key={item.href} item={item} active={item.href === current} collapsed={collapsed} />
        ))}
      </ul>
    </nav>
  )
}

function NavItem({ item, active, collapsed }: { item: NavItemConfig; active: boolean; collapsed: boolean }) {
  const { href, label, Icon, badge = 0, filled } = item
  return (
    <li className="relative">
      {/* One ink bar slides between sections. It sits on the sidebar's own edge. */}
      {active ? (
        <motion.span
          layoutId="sidebar-bar"
          aria-hidden="true"
          className="absolute top-1/2 -left-3.5 h-6 w-1 -translate-y-1/2 rounded-r-full bg-foreground"
          transition={{ type: "spring", stiffness: 480, damping: 40 }}
        />
      ) : null}
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className="group relative flex h-11 items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="relative grid size-11 shrink-0 place-items-center">
          <Icon
            className={cn("size-[22px] text-foreground transition-transform duration-300 group-hover:scale-110", EASE)}
            strokeWidth={active ? 2.2 : 1.75}
            fill={active && filled ? "currentColor" : "none"}
            aria-hidden="true"
          />
          {collapsed && badge > 0 ? (
            <span aria-hidden="true" className="absolute top-2 right-2 size-2 rounded-full bg-foreground ring-2 ring-sidebar" />
          ) : null}
        </span>
        <span className={cn(LABEL_TRACK, collapsed ? "grid-cols-[0fr]" : "grid-cols-[1fr]")}>
          <span className="min-w-0 overflow-hidden">
            <span
              className={cn(
                "flex items-center gap-3 whitespace-nowrap pr-4 text-[16px] transition-[opacity,translate] duration-300",
                EASE,
                collapsed ? "-translate-x-4 opacity-0" : "translate-x-0 opacity-100"
              )}
            >
              <span className={cn("relative pb-0.5", active ? "font-semibold" : "font-medium")}>
                {label}
                <span
                  aria-hidden="true"
                  className={cn("absolute inset-x-0 -bottom-px h-px origin-left scale-x-0 bg-foreground transition-transform duration-300 group-hover:scale-x-100", EASE)}
                />
              </span>
              {badge > 0 ? <CountPill count={badge} /> : null}
            </span>
          </span>
        </span>
        {collapsed ? (
          <span
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute top-1/2 left-full z-50 ml-2.5 -translate-y-1/2 translate-x-[-6px] rounded-xl bg-foreground px-3 py-1.5 text-[13px] font-semibold whitespace-nowrap text-background opacity-0 shadow-lg transition-[opacity,translate] duration-200 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100",
              EASE
            )}
          >
            {label}
            {badge > 0 ? ` · ${badge > 99 ? "99+" : badge}` : ""}
          </span>
        ) : null}
      </Link>
    </li>
  )
}

function CountPill({ count }: { count: number }) {
  return (
    <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-foreground px-1.5 text-[11px] font-semibold tabular-nums text-background">
      {count > 99 ? "99+" : count}
    </span>
  )
}

function ComposeLink({ collapsed }: { collapsed: boolean }) {
  return (
    <Link
      href="/#compose"
      className={cn(
        "flex h-11 items-center justify-center rounded-full bg-foreground text-[16px] font-semibold text-background transition-[opacity,scale] duration-200 hover:opacity-85 active:scale-[0.98] outline-none focus-visible:ring-2 focus-visible:ring-ring",
        EASE
      )}
    >
      <PenLine className="size-[18px] shrink-0" strokeWidth={2} aria-hidden="true" />
      <span
        className={cn(
          "overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-300",
          EASE,
          collapsed ? "max-w-0 opacity-0" : "max-w-24 opacity-100"
        )}
      >
        <span className="pl-2">Post</span>
      </span>
    </Link>
  )
}

function AccountLink({ viewer, collapsed }: { viewer: SidebarViewer; collapsed: boolean }) {
  return (
    <Link
      href="/settings"
      aria-label="Account and settings"
      className="group flex min-h-14 items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span
        className={cn(
          "grid size-11 shrink-0 place-items-center rounded-full ring-2 ring-transparent transition-[box-shadow] duration-300 group-hover:ring-foreground/30",
          EASE
        )}
      >
        <Avatar user={viewer} size={36} />
      </span>
      <span className={cn(LABEL_TRACK, collapsed ? "grid-cols-[0fr]" : "grid-cols-[1fr]")}>
        <span
          className={cn(
            "min-w-0 overflow-hidden pr-3 transition-[opacity,translate] duration-300",
            EASE,
            collapsed ? "-translate-x-4 opacity-0" : "translate-x-0 opacity-100"
          )}
        >
          <span className="block truncate text-[15px] font-semibold">{viewer.name}</span>
          <span className="block truncate text-sm text-muted-foreground">@{viewer.handle}</span>
          {viewer.status ? <span className="mt-0.5 block truncate text-[13px] text-foreground/75">{viewer.status}</span> : null}
        </span>
      </span>
    </Link>
  )
}
