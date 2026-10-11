"use client"

import Link from "next/link"
import { motion } from "motion/react"

export function TabLinks({ items }: { items: { href: string; label: string; active: boolean }[] }) {
  return (
    <nav aria-label="Sections" className="flex border-b border-border">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          scroll={false}
          aria-current={item.active ? "page" : undefined}
          className="relative flex flex-1 items-center justify-center py-3.5 text-[15px] font-semibold text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground aria-[current=page]:text-foreground"
        >
          {item.label}
          {item.active ? (
            <motion.span
              layoutId="tab-indicator"
              className="absolute inset-x-6 bottom-0 h-[3px] bg-dusk"
              transition={{ type: "spring", stiffness: 500, damping: 40 }}
            />
          ) : null}
        </Link>
      ))}
    </nav>
  )
}
