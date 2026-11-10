"use client"

import Link from "@/components/app/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import { PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { buildItems, type NavItemConfig } from "@/components/app/nav"
import { MORPH, SPRING_SELECT } from "@/components/app/motion"
import { useLiveCounts } from "@/components/app/live-counts"
import { SidebarFooter } from "@/components/app/sidebar-footer"
import { SidebarSearch } from "@/components/app/sidebar-search"
import { RhenkoSymbol } from "@/components/brand/symbol"
import type { AccountSummary } from "@/lib/auth"
import { SIDEBAR_COOKIE } from "@/lib/sidebar"
import { cn } from "@/lib/utils"

const OPEN_WIDTH = 264
const CLOSED_WIDTH = 72
const EASE = "ease-[cubic-bezier(0.22,1,0.36,1)]"
// Labels collapse to zero width in their own grid track, so the rail never reflows text.
const LABEL_TRACK = `grid min-w-0 flex-1 transition-[grid-template-columns] duration-[380ms] ${EASE}`

type SidebarViewer = { id: string; name: string; handle: string; avatarFile: string | null; status: string | null }

type Props = {
  viewer: SidebarViewer
  accounts: AccountSummary[]
  recent: string[]
  notifications: number
  messages: number
  initialCollapsed: boolean
}

// One full-height surface, fully opaque. The logo leads at the top, with the collapse control on the right, then search
// and the nav. The footer holds Post, then your profile with its account menu and log out. Search and Post are there only
// while the rail is open.
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
        <div className="flex flex-col">
          <Brand collapsed={collapsed} onToggle={() => save(!collapsed)} />
          <SearchSlot recent={recent} collapsed={collapsed} />
          <SidebarNav path={path} notifications={notifications} messages={messages} collapsed={collapsed} />
        </div>
        <SidebarFooter viewer={viewer} accounts={accounts} collapsed={collapsed} />
      </div>
    </aside>
  )
}

// The panel control. Expanded: the logo leads, and the panel-close icon on the right appears only while the row is hovered.
// Collapsed: the logo alone holds the rail's top. On hover it morphs into the panel-open button, and a click opens the rail.
function Brand({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  if (!collapsed) {
    return (
      <div className="group/brand flex h-11 items-center justify-between">
        <span className="grid size-11 place-items-center">
          <RhenkoSymbol className="size-7" />
        </span>
        <button
          type="button"
          onClick={onToggle}
          aria-label="Close sidebar"
          title="Close sidebar"
          className="grid size-9 place-items-center rounded-full text-foreground opacity-0 transition-[opacity,background-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] outline-none group-hover/brand:opacity-100 hover:bg-foreground/5 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <PanelLeftClose className="size-[20px] scale-x-[-1]" strokeWidth={1.9} aria-hidden="true" />
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
        className="group/brand relative grid size-11 shrink-0 place-items-center rounded-full text-foreground outline-none transition-colors duration-300 hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="grid place-items-center transition-[opacity,scale] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/brand:scale-75 group-hover/brand:opacity-0 group-focus-visible/brand:scale-75 group-focus-visible/brand:opacity-0">
          <RhenkoSymbol className="size-7" />
        </span>
        <span
          aria-hidden="true"
          className="absolute inset-0 grid place-items-center scale-75 opacity-0 transition-[opacity,scale] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/brand:scale-100 group-hover/brand:opacity-100 group-focus-visible/brand:scale-100 group-focus-visible/brand:opacity-100"
        >
          <PanelLeftOpen className="size-[20px] scale-x-[-1]" strokeWidth={1.9} />
        </span>
      </button>
    </div>
  )
}

// The search field sits under the logo while the rail is open. Closing the rail folds it away and the nav rises into its place,
// on the rail's own curve. Opening it unfolds it again. Its 8px above is part of the slot, so the spacing folds with it.
function SearchSlot({ recent, collapsed }: { recent: string[]; collapsed: boolean }) {
  const reduce = useReducedMotion()
  const slot = useRef<HTMLDivElement>(null)
  // While the slot is moving, it clips, so the field never shows past its own edge. Once it settles open, its card may overlay the nav.
  const [moving, setMoving] = useState(false)

  useEffect(() => {
    // Folding the field away takes focus with it, so a search that was open does not come back open.
    if (!collapsed) return
    const active = document.activeElement
    if (active instanceof HTMLElement && slot.current?.contains(active)) active.blur()
  }, [collapsed])

  return (
    <motion.div
      ref={slot}
      initial={false}
      animate={{ height: collapsed ? 0 : 52, paddingTop: collapsed ? 0 : 8, opacity: collapsed ? 0 : 1, scale: collapsed ? 0.92 : 1 }}
      transition={reduce ? { duration: 0 } : MORPH}
      onAnimationStart={() => setMoving(true)}
      onAnimationComplete={() => setMoving(false)}
      inert={collapsed}
      style={{ transformOrigin: "left center" }}
      className={cn("shrink-0", collapsed || moving ? "overflow-hidden" : "overflow-visible")}
    >
      <SidebarSearch recent={recent} />
    </motion.div>
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
    <nav aria-label="Main" className="pt-2">
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
        className={cn(
          "group relative flex h-11 items-center rounded-full text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring",
          active && "text-background"
        )}
      >
        {/* The current section sits on one filled pill. It slides from the section you left to this one. */}
        {active ? <motion.span layoutId="rail-current" aria-hidden="true" className="absolute inset-0 rounded-full bg-foreground" transition={SPRING_SELECT} /> : null}
        <span className="relative grid size-11 shrink-0 place-items-center">
          <Icon
            className={cn("size-[22px] transition-transform duration-300", EASE)}
            // The active section keeps the outline and gets a heavier stroke. The black pill already marks it, so the icon is never a solid blob.
            strokeWidth={active ? 2.2 : 1.75}
            fill="none"
            aria-hidden="true"
          />
          {collapsed && badge > 0 ? (
            <span aria-hidden="true" className={cn("absolute top-2 right-2 size-2 rounded-full ring-2", active ? "bg-background ring-foreground" : "bg-foreground ring-sidebar")} />
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
              {badge > 0 ? <CountPill count={badge} inverted={active} /> : null}
            </span>
          </span>
        </span>
        {collapsed ? (
          // The label, when the rail is closed, shows as a small card beside the icon. It rises and settles on hover or focus.
          <span
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute top-1/2 left-full z-50 ml-3 flex -translate-y-1/2 origin-left translate-x-[-6px] scale-95 items-center gap-2.5 rounded-2xl bg-popover px-3.5 py-2.5 text-[14px] font-semibold whitespace-nowrap text-popover-foreground opacity-0 [box-shadow:var(--lift-shadow)] transition-[opacity,translate,scale] duration-300 group-hover:translate-x-0 group-hover:scale-100 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:scale-100 group-focus-visible:opacity-100",
              EASE
            )}
          >
            {label}
            {badge > 0 ? <CountPill count={badge} /> : null}
          </span>
        ) : null}
      </Link>
    </li>
  )
}

// The unread count. On the current section's pill it takes the pill's colours, so it still reads against the ink.
function CountPill({ count, inverted = false }: { count: number; inverted?: boolean }) {
  return (
    <span
      className={cn(
        "ml-auto grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-xs font-semibold tabular-nums",
        inverted ? "bg-background text-foreground" : "bg-foreground text-background"
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  )
}
