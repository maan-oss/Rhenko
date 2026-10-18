"use client"

import { useState, type ReactNode } from "react"
import Link from "next/link"
import { motion } from "motion/react"
import { cn } from "@/lib/utils"

export type TabItem = {
  href: string
  label: string
  // Tabs are words, so the icon is not drawn. It stays optional so a call site can still say what a tab is for.
  icon?: ReactNode
  active: boolean
  // A small count shown after the label, for things like pending requests.
  badge?: number
}

// The one motion for an active fill that slides between items. Used where a fill moves, not on the page tabs.
export const TAB_FILL = { type: "spring", stiffness: 520, damping: 42 } as const

// A solid fill in the text colour, for a choice that is marked by a fill rather than a rule.
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

// The tab the person has just pressed. The raised tab moves on the press, before the page has loaded, and the page follows.
// The press is dropped once the page shows that tab, or if the page still shows the tab it started from.
export function usePressedTab(items: Pick<TabItem, "href" | "active">[]): { current: string | null; press: (href: string) => void } {
  const served = items.find((item) => item.active)?.href ?? null
  const [pressed, setPressed] = useState<{ from: string | null; to: string } | null>(null)
  const current = pressed && pressed.from === served ? pressed.to : served
  return { current, press: (href) => setPressed({ from: served, to: href }) }
}

// The tabs at the top of a page: one track of words, with the chosen tab lifted onto a raised surface. The surface casts a
// soft neutral shadow, so it reads as a layer on the track rather than a rule under the words. Each tab is a link, so every
// section keeps its own address.
export function TabLinks({ items, label = "Sections", className }: { items: TabItem[]; label?: string; className?: string }) {
  const { current, press } = usePressedTab(items)
  return (
    <nav
      aria-label={label}
      className={cn("mx-4 my-2 flex gap-1 overflow-x-auto rounded-full bg-muted p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)}
    >
      {items.map((item) => {
        const active = item.href === current
        return (
          <Link
            key={item.href}
            href={item.href}
            scroll={false}
            aria-current={active ? "page" : undefined}
            onClick={() => press(item.href)}
            className={cn(
              "tap-44 flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-[14px] font-semibold whitespace-nowrap outline-none transition-[background-color,color,box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-background text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.14),0_4px_12px_-6px_rgba(0,0,0,0.28)]"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {item.label}
            {item.badge ? (
              <span className="grid min-w-5 place-items-center rounded-full bg-foreground px-1.5 text-[11px] leading-5 font-semibold text-background">
                {item.badge > 99 ? "99+" : item.badge}
              </span>
            ) : null}
          </Link>
        )
      })}
    </nav>
  )
}
