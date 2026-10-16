import { Suspense } from "react"
import { requireViewer } from "@/lib/auth"
import { followRequestsFor, notificationsPage } from "@/lib/data"
import { firstParam } from "@/lib/params"
import { isNotificationTab, NOTIFICATION_PAGE_SIZE, type NotificationTab } from "@/lib/rules"
import { FollowRequestRow } from "@/components/app/follow-request-row"
import { NotificationsMarker } from "@/components/app/notifications-marker"
import { PageHeader } from "@/components/app/page-header"
import { TabLinks } from "@/components/app/tabs"
import { NotificationList } from "./notification-list"

type SearchParams = Promise<{ tab?: string | string[] }>

export default function NotificationsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={null}>
      <NotificationsBody searchParams={searchParams} />
    </Suspense>
  )
}

async function NotificationsBody({ searchParams }: { searchParams: SearchParams }) {
  const viewer = await requireViewer()
  const requested = firstParam((await searchParams).tab)
  const tab: NotificationTab = isNotificationTab(requested) ? requested : "all"
  const page = notificationsPage(viewer.id, tab, null, NOTIFICATION_PAGE_SIZE)
  const requests = tab === "all" ? followRequestsFor(viewer.id) : []

  return (
    <>
      <PageHeader title="Notifications">
        <TabLinks
          label="Notification sections"
          items={[
            { href: "/notifications", label: "All", active: tab === "all" },
            { href: "/notifications?tab=mentions", label: "Mentions", active: tab === "mentions" },
            { href: "/notifications?tab=priority", label: "Priority", active: tab === "priority" },
          ]}
        />
      </PageHeader>
      <NotificationsMarker />
      {requests.length > 0 ? (
        <section aria-label="Follow requests">
          <h2 className="px-4 pt-4 pb-2 text-sm font-semibold text-muted-foreground">Follow requests</h2>
          <ul className="list-none">
            {requests.map((request) => (
              <FollowRequestRow key={request.id} user={request} />
            ))}
          </ul>
        </section>
      ) : null}
      <NotificationList key={tab} initial={page} tab={tab} viewerHandle={viewer.handle} />
    </>
  )
}
