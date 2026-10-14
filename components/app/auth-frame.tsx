import type { ReactNode } from "react"
import { AuthArt } from "@/components/app/auth-art"
import { RhenkoSymbol } from "@/components/brand/symbol"
import { cn } from "@/lib/utils"

// The frame for sign-in, sign-up and setup. Wide screens show the art beside one column; phones show the column alone.
// Nothing is boxed in: the column sits on the page, so the form is the only thing to look at. A wide column is for a
// screen that shows something at its real size, such as the profile in setup.
export function AuthFrame({ width = "narrow", children }: { width?: "narrow" | "wide"; children: ReactNode }) {
  return (
    <main className="app-canvas relative flex min-h-dvh flex-col lg:flex-row">
      <section className="relative hidden overflow-hidden bg-sidebar lg:block lg:w-[44%] lg:shrink-0">
        <AuthArt />
      </section>
      <div className="flex flex-1 flex-col">
        <header className="flex items-center gap-2.5 px-6 pt-7 sm:px-10 lg:px-16">
          <RhenkoSymbol className="size-8" />
          <span className="text-[17px] font-semibold tracking-tight">Rhenko</span>
        </header>
        <div className="flex flex-1 items-center justify-center px-6 pt-10 pb-16 sm:px-10 lg:px-16">
          <div className={cn("w-full", width === "wide" ? "max-w-[560px]" : "max-w-[380px]")}>{children}</div>
        </div>
      </div>
    </main>
  )
}
