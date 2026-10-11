import type { ReactNode } from "react"
import { getViewer } from "@/lib/auth"
import { MobileNav, Sidebar } from "@/components/app/sidebar"
import { RightRail } from "@/components/app/right-rail"
import { Realtime } from "@/components/app/realtime"
import { Shortcuts } from "@/components/app/shortcuts"
import { ServiceWorkerRegister } from "@/components/app/sw-register"

// The app shell waits for the viewer and the rail before the first byte, so a page's
// notFound() runs before anything streams and the response gets a real 404 status.
export const instant = false

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[1320px] justify-center">
      <div aria-hidden="true" className="brand-gutter pointer-events-none fixed inset-0 -z-10" />
      <Sidebar />
      <main className="min-w-0 w-full max-w-[600px] flex-1 border-x border-border bg-background pb-24 lg:pb-0">{children}</main>
      <RightRail />
      <MobileNav />
      <LiveMounts />
      <ServiceWorkerRegister />
    </div>
  )
}

async function LiveMounts() {
  const viewer = await getViewer()
  if (!viewer) return null
  return (
    <>
      <Realtime />
      <Shortcuts handle={viewer.handle} />
    </>
  )
}
