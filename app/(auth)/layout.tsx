import type { ReactNode } from "react"
import { RhenkoSymbol } from "@/components/brand/symbol"

// The sign-in screens: a faint brand mark behind a single card. They don't copy the
// stacked social buttons of other networks.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-12">
      <div aria-hidden="true" className="brand-gutter pointer-events-none absolute inset-0" />
      <div className="relative z-10 flex w-full max-w-[400px] flex-col gap-7 rounded-[28px] border border-border bg-card/90 p-7 shadow-sm backdrop-blur sm:p-9">
        <div className="flex items-center gap-2.5">
          <RhenkoSymbol className="size-7" />
          <span className="text-[15px] font-semibold tracking-tight">Rhenko</span>
        </div>
        {children}
      </div>
    </main>
  )
}
