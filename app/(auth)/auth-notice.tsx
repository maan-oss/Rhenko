import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

// A short message at the top of a sign-in screen: what just happened, or why something can't be done here.
export function AuthNotice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warning" }) {
  return (
    <p
      role="status"
      className={cn(
        "rounded-2xl border px-4 py-3 text-[14px] leading-snug",
        tone === "warning" ? "border-destructive/40 bg-destructive/5" : "border-border bg-muted/40"
      )}
    >
      {children}
    </p>
  )
}
