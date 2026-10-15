"use client"

import { useId, useState, type ReactNode } from "react"
import Link from "next/link"
import { motion } from "motion/react"
import { cn } from "@/lib/utils"

export type TabItem = {
  href: string
  label: string
  icon: ReactNode
  active: boolean
  // A small count shown on the icon, for things like pending requests.
  badge?: number
}

// The one motion for the active tab. The fill slides from the old tab to the new one.
export const TAB_FILL = { type: "spring", stiffness: 520, damping: 42 } as const

// The active tab is a solid fill in the text colour: black on a light page, white on a dark one. A profile can theme its
// tabs from its banner (see BannerTabTheme), which sets the fill and the text on it through two variables.
export function TabFill({ layoutId }: { layoutId: string }) {
  return (
    <motion.span
      layoutId={layoutId}
      className="absolute inset-0 rounded-full"
      style={{ backgroundColor: "var(--tab-fill, var(--foreground))" }}
      transition={TAB_FILL}
    />
  )
}

function TabBadge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span className="absolute -top-1 -right-1.5 grid min-w-4 place-items-center rounded-full bg-dusk px-1 text-[10px] leading-4 font-semibold text-background">
      {count > 99 ? "99+" : count}
    </span>
  )
}

// The name of a tab. It opens out only on the active tab: the old name closes first, then the new one opens.
function TabName({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <span
      className={cn(
        "grid transition-[grid-template-columns,opacity] ease-[cubic-bezier(0.2,0.7,0.2,1)]",
        open ? "grid-cols-[1fr] opacity-100 duration-300 delay-100" : "grid-cols-[0fr] opacity-0 duration-150"
      )}
    >
      <span aria-hidden={!open} className={cn("min-w-0 overflow-hidden whitespace-nowrap text-[14px] font-semibold transition-[padding] duration-300", open ? "pl-2" : "pl-0")}>
        {children}
      </span>
    </span>
  )
}

// The tab the person has just pressed. The fill moves on the press, before the page has loaded, and the page follows. The
// press is dropped once the page shows that tab, or if the page still shows the tab it started from.
export function usePressedTab(items: TabItem[]): { current: string | null; press: (href: string) => void } {
  const served = items.find((item) => item.active)?.href ?? null
  const [pressed, setPressed] = useState<{ from: string | null; to: string } | null>(null)
  const current = pressed && pressed.from === served ? pressed.to : served
  return { current, press: (href) => setPressed({ from: served, to: href }) }
}

// One tab. The active tab shows its icon and its name in the fill. Every other tab is only its icon, in a smaller
// circle with no space for a name. The name stays on the link as aria-label, so it is never lost to a screen reader.
function TabLink({ item, active, fill, onPress }: { item: TabItem; active: boolean; fill: string; onPress: () => void }) {
  return (
    <Link
      href={item.href}
      scroll={false}
      title={item.label}
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
      onClick={onPress}
      className={cn(
        "relative inline-flex h-10 shrink-0 items-center rounded-full transition-colors duration-200 sm:h-9",
        active ? "px-4 text-[var(--tab-ink,var(--background))]" : "w-10 justify-center text-muted-foreground hover:bg-foreground/5 hover:text-foreground sm:w-9"
      )}
    >
      {active ? <TabFill layoutId={fill} /> : null}
      <span className="relative grid size-[18px] shrink-0 place-items-center [&>svg]:size-[18px]">
        {item.icon}
        {item.badge ? <TabBadge count={item.badge} /> : null}
      </span>
      <span className="relative inline-flex">
        <TabName open={active}>{item.label}</TabName>
      </span>
    </Link>
  )
}

// A segmented control in a glass pill, used at the top of a page.
export function TabLinks({ items, label = "Sections", className }: { items: TabItem[]; label?: string; className?: string }) {
  const id = useId()
  const { current, press } = usePressedTab(items)
  return (
    <nav aria-label={label} className={cn("glass inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-full p-1 [scrollbar-width:none]", className)}>
      {items.map((item) => (
        <TabLink key={item.href} item={item} active={item.href === current} fill={`${id}-fill`} onPress={() => press(item.href)} />
      ))}
    </nav>
  )
}

// A full-width row of tabs with a rule under it, used on a profile. Same behaviour as TabLinks.
export function IconTabs({ items, label = "Sections" }: { items: TabItem[]; label?: string }) {
  const id = useId()
  const { current, press } = usePressedTab(items)
  return (
    <nav aria-label={label} className="flex w-full items-center justify-between overflow-x-auto border-b border-border px-2 [scrollbar-width:none]">
      {items.map((item) => (
        <div key={item.href} className="flex h-12 shrink-0 items-center">
          <TabLink item={item} active={item.href === current} fill={`${id}-fill`} onPress={() => press(item.href)} />
        </div>
      ))}
    </nav>
  )
}
