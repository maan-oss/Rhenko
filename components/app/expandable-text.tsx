"use client"

import { useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"

// A long post shows its opening lines and folds the rest behind "Show more". Opening it does not follow the post link.
export function ExpandableText({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="space-y-1">
      <div className={cn("relative", !open && "max-h-[19rem] overflow-hidden")}>
        {children}
        {!open && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background to-transparent"
          />
        )}
      </div>
      <button
        type="button"
        aria-expanded={open}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setOpen((value) => !value)
        }}
        className="relative z-10 text-sm font-medium text-foreground hover:underline"
      >
        {open ? "Show less" : "Show more"}
      </button>
    </div>
  )
}
