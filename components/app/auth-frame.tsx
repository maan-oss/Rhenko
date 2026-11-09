import type { ReactNode } from "react"
import { RhenkoSymbol } from "@/components/brand/symbol"
import { cn } from "@/lib/utils"

// The frame for sign-in, sign-up and setup: one column on a plain page, the same on every screen size. Nothing decorative
// sits beside the form, so the form is the only thing to look at. On a phone the column starts near the top instead of the
// middle, so the keyboard does not move the content when a field is focused. A wide column is for setup, where the profile
// is shown at its real size.
export function AuthFrame({ width = "narrow", children }: { width?: "narrow" | "wide"; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="flex items-center gap-2.5 px-6 pt-[max(20px,env(safe-area-inset-top))] sm:px-10">
        <RhenkoSymbol className="size-8" />
        <span className="text-[17px] font-semibold tracking-tight">Rhenko</span>
      </header>
      <div className="flex flex-1 flex-col px-6 pt-8 pb-[max(32px,env(safe-area-inset-bottom))] sm:items-center sm:justify-center sm:px-10 sm:pt-0 sm:pb-16">
        <div className={cn("w-full", width === "wide" ? "max-w-[560px]" : "max-w-[380px]")}>{children}</div>
      </div>
    </main>
  )
}
