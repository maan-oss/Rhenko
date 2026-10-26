import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { getViewer, listAccounts } from "@/lib/auth"
import { circlesFor } from "@/lib/circles"
import { recentSearches, unreadMessageCount, unreadNotificationCount } from "@/lib/data"
import { SIDEBAR_COOKIE } from "@/lib/sidebar"
import { MobileTabBar } from "@/components/app/nav"
import { SidebarPanel } from "@/components/app/sidebar-panel"

export async function Sidebar() {
  const viewer = await getViewer()
  if (!viewer) redirect("/login")
  const store = await cookies()
  const accounts = await listAccounts()
  return (
    <SidebarPanel
      viewer={{
        id: viewer.id,
        name: viewer.name,
        handle: viewer.handle,
        avatarFile: viewer.avatarFile,
        status: viewer.status ?? null,
      }}
      accounts={accounts}
      recent={await recentSearches(viewer.id)}
      notifications={await unreadNotificationCount(viewer.id)}
      messages={await unreadMessageCount(viewer.id)}
      initialCollapsed={store.get(SIDEBAR_COOKIE)?.value === "collapsed"}
    />
  )
}

export async function MobileNav() {
  const viewer = await getViewer()
  if (!viewer) return null
  const accounts = await listAccounts()
  const circles = (await circlesFor(viewer.id)).map((circle) => ({ id: circle.id, name: circle.name }))
  return (
    <MobileTabBar
      viewer={viewer}
      accounts={accounts}
      notifications={await unreadNotificationCount(viewer.id)}
      messages={await unreadMessageCount(viewer.id)}
      circles={circles}
    />
  )
}
