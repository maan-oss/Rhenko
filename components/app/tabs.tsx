"use client"

import type { ReactNode } from "react"
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

// Icons carry every tab. The active tab also shows its name, so the current section is never a guess.
// Inactive tabs keep their label in aria-label and in the title, so they stay readable to screen readers and on hover.
function TabBadge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span className="absolute -top-1 -right-1.5 grid min-w-4 place-items-center rounded-full bg-dusk px-1 text-[10px] leading-4 font-semibold text-background">
      {count > 99 ? "99+" : count}
    </span>
  )
}

// A compact segmented control. The pill slides between options, so the change reads as movement.
export function TabLinks({ items, label = "Sections", className }: { items: TabItem[]; label?: string; className?: string }) {
  return (
    <nav
      aria-label={label}
      className={cn("glass inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full p-1 [scrollbar-width:none]", className)}
    >
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          scroll={false}
          title={item.label}
          aria-label={item.label}
          aria-current={item.active ? "page" : undefined}
          className={cn(
            "relative flex h-10 shrink-0 items-center justify-center gap-2 sm:h-8 rounded-full text-[14px] font-semibold whitespace-nowrap transition-colors duration-200",
            item.active ? "px-3.5 text-[var(--metal-text)]" : "w-10 text-muted-foreground hover:text-foreground sm:w-9"
          )}
        >
          {item.active ? (
            <motion.span
              layoutId="tab-pill"
              className="metal absolute inset-0 rounded-full"
              transition={{ type: "spring", stiffness: 520, damping: 40 }}
            />
          ) : null}
          <span className="relative grid size-[18px] place-items-center [&>svg]:size-[18px]">
            {item.icon}
            {item.badge ? <TabBadge count={item.badge} /> : null}
          </span>
          {item.active ? <span className="relative">{item.label}</span> : null}
        </Link>
      ))}
    </nav>
  )
}

// A full-width bar with an underline that slides to the open section. Used for the profile, where the banner sits above it.
export function IconTabs({ items, label = "Sections" }: { items: TabItem[]; label?: string }) {
  return (
    <nav aria-label={label} className="flex border-b border-border">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          scroll={false}
          title={item.label}
          aria-label={item.label}
          aria-current={item.active ? "page" : undefined}
          className={cn(
            "relative flex h-12 flex-auto items-center justify-center gap-2 px-4 text-[14px] font-semibold whitespace-nowrap transition-colors duration-200",
            item.active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <span className="relative grid size-[20px] place-items-center [&>svg]:size-[20px]">
            {item.icon}
            {item.badge ? <TabBadge count={item.badge} /> : null}
          </span>
          {item.active ? <span>{item.label}</span> : null}
          {item.active ? (
            <motion.span
              layoutId="tab-underline"
              className="absolute inset-x-4 bottom-0 h-[3px] rounded-full bg-foreground"
              transition={{ type: "spring", stiffness: 520, damping: 40 }}
            />
          ) : null}
        </Link>
      ))}
    </nav>
  )
}
