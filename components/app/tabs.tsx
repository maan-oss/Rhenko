"use client"

import { useId, useState, type ReactNode } from "react"
import Link from "next/link"
import { motion } from "motion/react"
import { cn } from "@/lib/utils"

export type TabItem = {
  href: string
  label: string
  // Tabs are words, as on X, so the icon is not drawn. It stays optional so a call site can still say what a tab is for.
  icon?: ReactNode
  active: boolean
  // A small count shown after the label, for things like pending requests.
  badge?: number
}

// The one motion for the active tab. The underline slides from the old tab to the new one.
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

// The tab the person has just pressed. The underline moves on the press, before the page has loaded, and the page follows. The
// press is dropped once the page shows that tab, or if the page still shows the tab it started from.
export function usePressedTab(items: Pick<TabItem, "href" | "active">[]): { current: string | null; press: (href: string) => void } {
  const served = items.find((item) => item.active)?.href ?? null
  const [pressed, setPressed] = useState<{ from: string | null; to: string } | null>(null)
  const current = pressed && pressed.from === served ? pressed.to : served
  return { current, press: (href) => setPressed({ from: served, to: href }) }
}

// The tabs at the top of a page, as X sets them: words spread across the width, the active one in the page's ink under a
// rule that slides from tab to tab. Each tab is a link, so every section keeps its own address.
export function TabLinks({ items, label = "Sections", className }: { items: TabItem[]; label?: string; className?: string }) {
  const id = useId()
  const { current, press } = usePressedTab(items)
  return (
    <nav
      aria-label={label}
      className={cn("flex w-full overflow-x-auto border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)}
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
              "flex h-12 min-w-0 flex-1 justify-center px-3 transition-colors hover:bg-muted/60",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <span className="relative flex h-full items-center gap-1.5 text-[15px] font-semibold whitespace-nowrap">
              {item.label}
              {item.badge ? (
                <span className="grid min-w-5 place-items-center rounded-full bg-foreground px-1.5 text-[11px] leading-5 font-semibold text-background">
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              ) : null}
              {active ? <motion.span layoutId={`${id}-underline`} className="absolute inset-x-0 bottom-0 h-1 rounded-full bg-foreground" transition={TAB_FILL} /> : null}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
