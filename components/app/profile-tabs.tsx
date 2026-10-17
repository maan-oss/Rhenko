"use client"

import { useId } from "react"
import Link from "next/link"
import { motion } from "motion/react"
import { cn } from "@/lib/utils"
import { TAB_FILL, usePressedTab, type TabItem } from "@/components/app/tabs"

// A profile's sections as one track of pills. The chosen section is a filled pill that slides to the next one when pressed.
// It is the profile's own control, not the underline row the rest of the app uses. Each section is still a link.
export function ProfileTabs({ items, label }: { items: TabItem[]; label: string }) {
  const id = useId()
  const { current, press } = usePressedTab(items)
  return (
    <nav aria-label={label} className="mx-4 flex gap-1 overflow-x-auto rounded-2xl bg-muted p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
              "relative flex h-10 min-w-0 flex-1 items-center justify-center rounded-xl px-3 text-sm font-semibold whitespace-nowrap transition-colors",
              active ? "text-background" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {active ? <motion.span layoutId={`${id}-fill`} className="absolute inset-0 rounded-xl bg-foreground" transition={TAB_FILL} /> : null}
            <span className="relative">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
