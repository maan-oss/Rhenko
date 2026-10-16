"use client"

import { useId } from "react"
import Link from "next/link"
import { motion } from "motion/react"
import { TAB_FILL, usePressedTab } from "@/components/app/tabs"
import { cn } from "@/lib/utils"

export type ProfileTabItem = { href: string; label: string; active: boolean }

// The sections of a profile: text tabs across the full width, the active one underlined in the page's ink. The underline
// slides from the old tab to the new one, the same motion as the rest of the app's tabs.
export function ProfileTabs({ items, label }: { items: ProfileTabItem[]; label: string }) {
  const id = useId()
  const { current, press } = usePressedTab(items)
  return (
    <nav
      aria-label={label}
      className="flex w-full overflow-x-auto border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
              "flex h-12 min-w-0 flex-1 justify-center px-2 transition-colors hover:bg-muted/60",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <span className="relative flex h-full items-center text-[15px] font-semibold whitespace-nowrap">
              {item.label}
              {active ? (
                <motion.span
                  layoutId={`${id}-underline`}
                  className="absolute inset-x-0 bottom-0 h-1 rounded-full bg-foreground"
                  transition={TAB_FILL}
                />
              ) : null}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
