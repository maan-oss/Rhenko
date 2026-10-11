import Link from "next/link"
import { redirect } from "next/navigation"
import { PenLine, LogOut } from "lucide-react"
import { logout } from "@/actions/auth"
import { getViewer } from "@/lib/auth"
import { unreadMessageCount, unreadNotificationCount } from "@/lib/data"
import { Avatar } from "@/components/app/avatar"
import { MobileTabBar, NavRail } from "@/components/app/nav"
import { RhenkoSymbol } from "@/components/brand/symbol"
import { Button } from "@/components/ui/button"

export async function Sidebar() {
  const viewer = await getViewer()
  if (!viewer) redirect("/login")
  const notifications = unreadNotificationCount(viewer.id)
  const messages = unreadMessageCount(viewer.id)
  return (
    <aside className="sticky top-0 hidden h-dvh w-[260px] shrink-0 flex-col justify-between py-4 pr-4 lg:flex">
      <div className="flex flex-col gap-4">
        <Link href="/" aria-label="Rhenko home" className="flex w-fit items-center gap-2.5 rounded-lg px-3 py-2">
          <RhenkoSymbol className="size-7" />
          <span className="text-xl font-semibold tracking-tight">Rhenko</span>
        </Link>
        <NavRail handle={viewer.handle} notifications={notifications} messages={messages} />
        <Button render={<Link href="/#compose" />} className="h-12 w-full rounded-full text-[16px] font-semibold">
          <PenLine className="size-4" />
          Post
        </Button>
      </div>
      <div className="flex items-center gap-2 rounded-lg p-2">
        <Link href={`/${viewer.handle}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-full p-1.5 pr-3 transition-colors hover:bg-muted">
          <Avatar user={viewer} size={40} />
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-semibold">{viewer.name}</span>
            <span className="block truncate text-sm text-muted-foreground">@{viewer.handle}</span>
          </span>
        </Link>
        <form action={logout}>
          <Button type="submit" variant="ghost" size="icon" aria-label="Log out">
            <LogOut className="size-4" />
          </Button>
        </form>
      </div>
    </aside>
  )
}

export async function MobileNav() {
  const viewer = await getViewer()
  if (!viewer) return null
  return (
    <MobileTabBar
      handle={viewer.handle}
      notifications={unreadNotificationCount(viewer.id)}
      messages={unreadMessageCount(viewer.id)}
    />
  )
}
