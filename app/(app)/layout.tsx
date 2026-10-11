import { Suspense, type ReactNode } from "react"
import { MobileNav, Sidebar } from "@/components/app/sidebar"
import { RightRail } from "@/components/app/right-rail"

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[1280px] justify-center">
      <Suspense fallback={<div className="hidden w-[260px] shrink-0 lg:block" />}>
        <Sidebar />
      </Suspense>
      <main className="min-w-0 w-full max-w-[600px] flex-1 border-x border-border pb-20 xl:pb-0">{children}</main>
      <Suspense fallback={<div className="hidden w-[340px] shrink-0 xl:block" />}>
        <RightRail />
      </Suspense>
      <Suspense fallback={null}>
        <MobileNav />
      </Suspense>
    </div>
  )
}
