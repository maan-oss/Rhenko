import Link from "next/link"
import { redirect } from "next/navigation"
import { PenLine } from "lucide-react"
import { getViewer } from "@/lib/auth"
import { recentSearches, unreadMessageCount, unreadNotificationCount } from "@/lib/data"
import { Avatar } from "@/components/app/avatar"
import { MobileTabBar, NavRail } from "@/components/app/nav"
import { SidebarSearch } from "@/components/app/sidebar-search"
import { RhenkoSymbol } from "@/components/brand/symbol"

export async function Sidebar() {
  const viewer = await getViewer()
  if (!viewer) redirect("/login")
  const notifications = unreadNotificationCount(viewer.id)
  const messages = unreadMessageCount(viewer.id)
  const recent = recentSearches(viewer.id)
  return (
    <aside className="sticky top-0 hidden h-dvh w-[272px] shrink-0 py-3 pl-3 lg:flex">
      <div className="flex w-full flex-col justify-between gap-6 rounded-[28px] border border-sidebar-border bg-sidebar p-4">
        <div className="flex flex-col gap-5">
          <Link href="/" aria-label="Rhenko home" className="grid size-11 place-items-center rounded-full transition-colors hover:bg-foreground/5">
            <RhenkoSymbol className="size-7 opacity-85" />
          </Link>
          <SidebarSearch recent={recent} />
          <NavRail notifications={notifications} messages={messages} />
          <Link
            href="/#compose"
            className="flex h-12 items-center justify-center gap-2 rounded-full bg-foreground text-[16px] font-semibold text-background transition-opacity duration-200 hover:opacity-85"
          >
            <PenLine className="size-4" aria-hidden="true" />
            Post
          </Link>
        </div>
        <Link
          href="/settings"
          aria-label="Account and settings"
          className="flex items-center gap-3 rounded-full p-2 pr-3 transition-colors duration-200 hover:bg-foreground/5"
        >
          <Avatar user={viewer} size={44} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold">{viewer.name}</span>
            <span className="block truncate text-sm text-muted-foreground">@{viewer.handle}</span>
            {viewer.status ? <span className="mt-0.5 block truncate text-[13px] text-foreground/75">{viewer.status}</span> : null}
          </span>
        </Link>
      </div>
    </aside>
  )
}

export async function MobileNav() {
  const viewer = await getViewer()
  if (!viewer) return null
  return (
    <MobileTabBar
      viewer={viewer}
      notifications={unreadNotificationCount(viewer.id)}
      messages={unreadMessageCount(viewer.id)}
    />
  )
}
