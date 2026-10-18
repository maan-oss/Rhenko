import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

// An empty list reads as an invitation: what belongs here, then the one thing to do about it.
// The same two button looks are used for the actions, so every empty page offers its way forward the same way.
export function emptyActionClass(kind: "primary" | "secondary"): string {
  return cn(
    "inline-flex h-11 items-center justify-center rounded-full px-5 text-[15px] font-semibold whitespace-nowrap outline-none transition-[opacity,background-color] duration-200 focus-visible:ring-2 focus-visible:ring-ring",
    kind === "primary" ? "metal hover:opacity-85" : "glass hover:bg-foreground/5"
  )
}

// The large version is for Home, where an empty feed is the first thing a new person sees.
export function EmptyState({
  title,
  body,
  children,
  className,
  large = false,
  compact = false,
}: {
  title: string
  body: string
  children?: ReactNode
  className?: string
  large?: boolean
  // A short version for a place where the page already says what goes here, such as a post with no replies yet.
  compact?: boolean
}) {
  return (
    <div className={cn("flex flex-col items-center gap-1.5 px-6 text-center", large ? "pt-10 pb-14" : compact ? "pt-5 pb-6" : "pt-10 pb-6", className)}>
      <p className={cn("max-w-full font-semibold [overflow-wrap:anywhere]", large ? "text-[26px] leading-tight tracking-tight" : compact ? "text-[15px]" : "text-lg")}>{title}</p>
      <p className={cn("max-w-sm text-muted-foreground [overflow-wrap:anywhere]", large ? "text-base leading-relaxed" : "text-[15px]")}>{body}</p>
      {children ? <div className="mt-4 flex w-full flex-wrap items-center justify-center gap-2">{children}</div> : null}
    </div>
  )
}
