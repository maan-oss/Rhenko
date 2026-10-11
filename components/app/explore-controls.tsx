"use client"

import type { ReactNode } from "react"
import Link, { useLinkStatus } from "next/link"
import { motion } from "motion/react"
import { Clock, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

// Both controls are links, so the page stays a plain server render and the choice is in the URL.
// While the next page is loading, the control pulses instead of freezing.
function Pending({ children, className }: { children: ReactNode; className?: string }) {
  const { pending } = useLinkStatus()
  return <span className={cn("grid place-items-center transition-opacity duration-200", pending && "animate-pulse", className)}>{children}</span>
}

export function RankingButton({ href, sort }: { href: string; sort: "top" | "latest" }) {
  const top = sort === "top"
  const label = top ? "Ranked for you. Switch to latest." : "Latest first. Switch to ranked for you."
  return (
    <Link
      href={href}
      scroll={false}
      aria-label={label}
      title={label}
      className="grid size-12 shrink-0 place-items-center rounded-full bg-muted transition-colors duration-200 hover:bg-foreground/10"
    >
      <Pending>{top ? <Sparkles className="size-[18px]" aria-hidden="true" /> : <Clock className="size-[18px]" aria-hidden="true" />}</Pending>
    </Link>
  )
}

export function MediaSwitch({ href, checked }: { href: string; checked: boolean }) {
  return (
    <Link
      href={href}
      scroll={false}
      role="switch"
      aria-checked={checked}
      aria-label="Only posts with photos or videos"
      className="flex h-12 shrink-0 items-center gap-2.5 rounded-full pr-1 pl-2 text-sm font-semibold"
    >
      <span>Media</span>
      <Track checked={checked} />
    </Link>
  )
}

function Track({ checked }: { checked: boolean }) {
  const { pending } = useLinkStatus()
  return (
    <span className={cn("flex h-7 w-12 items-center rounded-full p-[3px] transition-colors duration-200", checked ? "bg-foreground" : "bg-muted-foreground/35")}>
      <motion.span
        aria-hidden="true"
        className={cn("size-[22px] rounded-full bg-background shadow-sm", pending && "animate-pulse")}
        animate={{ x: checked ? 20 : 0 }}
        transition={{ type: "spring", stiffness: 500, damping: 36 }}
      />
    </span>
  )
}
