"use client"

import Link from "next/link"
import { motion } from "motion/react"

// A compact segmented control. The pill slides between options, so the change reads as movement.
export function TabLinks({ items }: { items: { href: string; label: string; active: boolean }[] }) {
  return (
    <nav aria-label="Sections" className="inline-flex max-w-full items-center gap-0.5 rounded-full bg-muted p-1">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          scroll={false}
          aria-current={item.active ? "page" : undefined}
          className={`relative flex h-8 min-w-0 flex-1 items-center justify-center rounded-full px-4 text-[14px] font-semibold whitespace-nowrap transition-colors duration-200 ${
            item.active ? "text-background" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {item.active ? (
            <motion.span
              layoutId="tab-pill"
              className="absolute inset-0 rounded-full bg-foreground"
              transition={{ type: "spring", stiffness: 520, damping: 40 }}
            />
          ) : null}
          <span className="relative">{item.label}</span>
        </Link>
      ))}
    </nav>
  )
}
