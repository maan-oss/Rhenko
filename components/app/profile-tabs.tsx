"use client"

import Link from "next/link"
import { cn } from "@/lib/utils"
import { usePressedTab, type TabItem } from "@/components/app/tabs"

// A profile's sections as one track of pills. The chosen section is a solid ink pill. It changes at once when pressed:
// nothing slides and nothing scales. Each section is still a link.
export function ProfileTabs({ items, label }: { items: TabItem[]; label: string }) {
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
              "flex h-10 min-w-0 flex-1 items-center justify-center rounded-xl px-3 text-sm font-semibold whitespace-nowrap transition-colors",
              active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
