"use client"

import { useId, type ReactNode } from "react"
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

// The one motion every tab uses. Only the fill moves: it slides from the old tab to the new one, and nothing else in a
// tab changes size or position when it is chosen.
export const TAB_FILL = { type: "spring", stiffness: 520, damping: 42 } as const

// The active tab is a solid fill in the text colour: black on a light page, white on a dark one. Its icon and label
// take the page colour, so they stay readable on the fill.
export function TabFill({ layoutId, area = "inset-0 rounded-full" }: { layoutId: string; area?: string }) {
  return <motion.span layoutId={layoutId} className={cn("absolute bg-foreground", area)} transition={TAB_FILL} />
}

function TabBadge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span className="absolute -top-1 -right-1.5 grid min-w-4 place-items-center rounded-full bg-dusk px-1 text-[10px] leading-4 font-semibold text-background">
      {count > 99 ? "99+" : count}
    </span>
  )
}

// A segmented control. Every tab is the same size and shows its icon and name, so choosing one moves only the fill.
export function TabLinks({ items, label = "Sections", className }: { items: TabItem[]; label?: string; className?: string }) {
  const id = useId()
  return (
    <nav
      aria-label={label}
      className={cn("glass inline-grid max-w-full auto-cols-fr grid-flow-col gap-1 overflow-x-auto rounded-full p-1 [scrollbar-width:none]", className)}
    >
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          scroll={false}
          aria-current={item.active ? "page" : undefined}
          className={cn(
            "relative inline-flex h-10 items-center justify-center gap-2 rounded-full px-4 text-[14px] font-semibold whitespace-nowrap transition-colors duration-200 sm:h-9",
            item.active ? "text-background" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {item.active ? <TabFill layoutId={`${id}-fill`} /> : null}
          <span className="relative grid size-[18px] place-items-center [&>svg]:size-[18px]">
            {item.icon}
            {item.badge ? <TabBadge count={item.badge} /> : null}
          </span>
          <span className="relative">{item.label}</span>
        </Link>
      ))}
    </nav>
  )
}

// A full-width row of icon tabs for the profile. Every tab is the same size. The fill sits inside its tab, and the name
// is kept for screen readers and as a tooltip, so the row stays one line on a phone.
export function IconTabs({ items, label = "Sections" }: { items: TabItem[]; label?: string }) {
  const id = useId()
  return (
    <nav aria-label={label} className="grid auto-cols-fr grid-flow-col border-b border-border">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          scroll={false}
          title={item.label}
          aria-label={item.label}
          aria-current={item.active ? "page" : undefined}
          className={cn(
            "relative flex h-12 items-center justify-center transition-colors duration-200",
            item.active ? "text-background" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {item.active ? <TabFill layoutId={`${id}-fill`} area="inset-x-2 inset-y-1.5 rounded-xl" /> : null}
          <span className="relative grid size-5 place-items-center [&>svg]:size-5">
            {item.icon}
            {item.badge ? <TabBadge count={item.badge} /> : null}
          </span>
        </Link>
      ))}
    </nav>
  )
}
