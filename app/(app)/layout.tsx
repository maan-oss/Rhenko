import type { ReactNode } from "react"
import { redirect } from "next/navigation"
import { getViewer } from "@/lib/auth"
import { TERMS_VERSION } from "@/lib/legal"
import { MobileNav, Sidebar } from "@/components/app/sidebar"
import { RightRail } from "@/components/app/right-rail"
import { BannerHost } from "@/components/app/banner-host"
import { CallSurface } from "@/components/app/call-surface"
import { LiveCountsProvider } from "@/components/app/live-counts"
import { Realtime } from "@/components/app/realtime"
import { Shortcuts } from "@/components/app/shortcuts"
import { ServiceWorkerRegister } from "@/components/app/sw-register"
import { ViewerLanguages } from "@/components/app/viewer-languages"
import { unreadMessageCount, unreadNotificationCount } from "@/lib/data"
import { translationOn } from "@/lib/translate"

// The app shell waits for the viewer and the rail before the first byte, so a page's
// notFound() runs before anything streams and the response gets a real 404 status.
export const instant = false

// An account must agree to the current Terms and Privacy Policy before anything in the app. Until it does, every page
// here sends it to the agreement screen.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const viewer = await getViewer()
  if (viewer && viewer.termsVersion !== TERMS_VERSION) redirect("/accept-terms")
  // Someone who is not signed in sees the page alone, without the app's frame. The home page shows the landing page to
  // them, and every other page sends them to sign in.
  if (!viewer) return <>{children}</>
  // The badge numbers. A new object on each render, so the badges take the numbers the server now has.
  const counts = viewer
    ? { notifications: await unreadNotificationCount(viewer.id), messages: await unreadMessageCount(viewer.id) }
    : { notifications: 0, messages: 0 }
  return (
    <ViewerLanguages speaks={viewer?.speaks ?? []} translate={translationOn()}>
      <LiveCountsProvider initial={counts}>
        <div className="app-canvas mx-auto flex min-h-dvh w-full max-w-[1320px] justify-center">
          <Sidebar />
          <main className="min-w-0 w-full max-w-[600px] flex-1 border-x border-border bg-background pb-24 lg:pb-0">{children}</main>
          <RightRail />
          <MobileNav />
          <LiveMounts />
          <BannerHost />
          <ServiceWorkerRegister />
        </div>
      </LiveCountsProvider>
    </ViewerLanguages>
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
