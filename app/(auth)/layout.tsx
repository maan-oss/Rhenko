import type { ReactNode } from "react"
import { AuthArt } from "@/components/app/auth-art"
import { RhenkoSymbol } from "@/components/brand/symbol"

// The sign-in screens. The art sits beside the form on wide screens; phones show the form alone.
// The form is one card, the same on every sign-in screen.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="app-canvas relative flex min-h-dvh flex-col overflow-hidden lg:flex-row">
      {/* The art is for computers only. Phones get the form alone. */}
      <section className="relative hidden overflow-hidden bg-sidebar lg:block lg:w-[46%] lg:shrink-0">
        <AuthArt />
      </section>
      <div className="relative z-10 flex flex-1 items-center justify-center px-4 py-12 sm:px-8 lg:px-12">
        <div className="flex w-full max-w-[400px] flex-col gap-7 rounded-[28px] border border-border bg-card/90 p-7 shadow-sm backdrop-blur sm:p-9">
          <div className="flex items-center gap-3">
            <RhenkoSymbol className="size-9" />
            <span className="text-[36px] leading-none font-semibold tracking-[-0.03em]">Rhenko</span>
          </div>
          {children}
        </div>
      </div>
    </main>
  )
}
