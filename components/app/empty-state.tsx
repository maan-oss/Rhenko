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

export function EmptyState({ title, body, children, className }: { title: string; body: string; children?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center gap-1.5 px-6 pt-14 pb-16 text-center", className)}>
      <p className="max-w-full text-lg font-semibold [overflow-wrap:anywhere]">{title}</p>
      <p className="max-w-sm text-[15px] text-muted-foreground [overflow-wrap:anywhere]">{body}</p>
      {children ? <div className="mt-4 flex w-full flex-wrap items-center justify-center gap-2">{children}</div> : null}
    </div>
  )
}
