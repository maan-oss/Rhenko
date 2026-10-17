"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { motion } from "motion/react"
import { buildItems, type NavItemConfig } from "@/components/app/nav"
import { useLiveCounts } from "@/components/app/live-counts"
import { SidebarFooter } from "@/components/app/sidebar-footer"
import { SidebarSearch } from "@/components/app/sidebar-search"
import { RhenkoSymbol } from "@/components/brand/symbol"
import type { AccountSummary } from "@/lib/auth"
import { SIDEBAR_COOKIE } from "@/lib/sidebar"
import { cn } from "@/lib/utils"

// The active tint slides from one destination to the next, the same spring the phone dock uses.
const SPRING = { type: "spring", stiffness: 420, damping: 40 } as const
const OPEN_WIDTH = 264
const CLOSED_WIDTH = 72
const EASE = "ease-[cubic-bezier(0.22,1,0.36,1)]"
// Labels collapse to zero width in their own grid track, so the rail never reflows text.
const LABEL_TRACK = `grid min-w-0 flex-1 transition-[grid-template-columns] duration-[380ms] ${EASE}`

export type SidebarViewer = { id: string; name: string; handle: string; avatarFile: string | null; status: string | null }

type Props = {
  viewer: SidebarViewer
  accounts: AccountSummary[]
  recent: string[]
  notifications: number
  messages: number
  initialCollapsed: boolean
}

// One full-height surface, fully opaque. The logo leads at the top, with the collapse control on the right.
// The footer holds Post, then your profile with its account menu and log out.
export function SidebarPanel({ viewer, accounts, recent, notifications, messages, initialCollapsed }: Props) {
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
        <SidebarFooter viewer={viewer} accounts={accounts} collapsed={collapsed} />
      </div>
    </aside>
  )
}

// One panel icon for both states, the way most apps draw a sidebar toggle. Expanded: the logo sits on the left and
// the panel-close icon on the right. Collapsed: the panel-open icon stands alone, so the control is always visible.
function Brand({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  if (!collapsed) {
    return (
      <div className="flex h-11 items-center justify-between">
        <span className="grid size-11 place-items-center">
          <RhenkoSymbol className="size-7" />
        </span>
        <button
          type="button"
          onClick={onToggle}
          aria-label="Close sidebar"
          title="Close sidebar"
          className="grid size-9 place-items-center rounded-full text-foreground transition-colors duration-200 outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <PanelLeftClose className="size-[20px]" strokeWidth={1.9} aria-hidden="true" />
        </button>
      </div>
    )
  }
  return (
    <div className="flex h-11 items-center">
      <button
        type="button"
        onClick={onToggle}
        aria-label="Open sidebar"
        aria-expanded={false}
        title="Open sidebar"
        className="grid size-11 shrink-0 place-items-center rounded-full text-foreground transition-colors duration-200 outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <PanelLeftOpen className="size-[20px]" strokeWidth={1.9} aria-hidden="true" />
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
  // The live counts when the app shell provides them, otherwise the numbers the server gave.
  const live = useLiveCounts()
  const items = buildItems(live?.notifications ?? notifications, live?.messages ?? messages)
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
  const { href, label, Icon, badge = 0 } = item
  return (
    <li className="relative">
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className="group relative isolate flex h-11 items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {/* The one active state: a dusk tint that slides between destinations. It sits behind the row's content. */}
        {active ? (
          <motion.span layoutId="rail-pill" aria-hidden="true" transition={SPRING} className="absolute inset-0 -z-10 rounded-full bg-dusk/12" />
        ) : null}
        <span className="relative grid size-11 shrink-0 place-items-center">
          <Icon
            className={cn(
              "size-[22px] transition-transform duration-300 group-hover:scale-110",
              active ? "text-dusk" : "text-foreground",
              EASE
            )}
            strokeWidth={active ? 2.2 : 1.75}
            fill={active && item.filled ? "currentColor" : "none"}
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
              <span className={cn(active ? "font-semibold" : "font-medium")}>{label}</span>
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
