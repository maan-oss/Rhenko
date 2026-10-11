import type { ReactNode } from "react"
import { redirect } from "next/navigation"
import { getViewer } from "@/lib/auth"
import { TERMS_VERSION } from "@/lib/legal"
import { MobileNav, Sidebar } from "@/components/app/sidebar"
import { RightRail } from "@/components/app/right-rail"
import { BannerHost } from "@/components/app/banner-host"
import { CallSurface } from "@/components/app/call-surface"
import { Realtime } from "@/components/app/realtime"
import { Shortcuts } from "@/components/app/shortcuts"
import { ServiceWorkerRegister } from "@/components/app/sw-register"

// The app shell waits for the viewer and the rail before the first byte, so a page's
// notFound() runs before anything streams and the response gets a real 404 status.
export const instant = false

// An account must agree to the current Terms and Privacy Policy before anything in the app. Until it does, every page
// here sends it to the agreement screen.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const viewer = await getViewer()
  if (viewer && viewer.termsVersion !== TERMS_VERSION) redirect("/accept-terms")
  return (
    <div className="app-canvas mx-auto flex min-h-dvh w-full max-w-[1320px] justify-center">
      <Sidebar />
      <main className="min-w-0 w-full max-w-[600px] flex-1 border-x border-border bg-background pb-24 lg:pb-0">{children}</main>
      <RightRail />
      <MobileNav />
      <LiveMounts />
      <BannerHost />
      <ServiceWorkerRegister />
    </div>
  )
}

// The realtime stream belongs to the signed-in account and opens again when it changes. The call surface shows that
// account as "You" in a group call.
async function LiveMounts() {
  const viewer = await getViewer()
  if (!viewer) return null
  return (
    <>
      <Realtime viewerId={viewer.id} />
      <CallSurface self={{ id: viewer.id, name: viewer.name, handle: viewer.handle, avatarFile: viewer.avatarFile }} />
      <Shortcuts handle={viewer.handle} />
    </>
  )
}
