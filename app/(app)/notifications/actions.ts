"use server"

import { getViewer } from "@/lib/auth"
import { notificationsPage, type NotificationView } from "@/lib/data"
import { NOTIFICATION_PAGE_SIZE } from "@/lib/rules"

export type MoreNotifications = { ok: true; items: NotificationView[]; next: number | null } | { ok: false; error: string }

// The next page of notifications for "Show more": the ones older than `before`, which is the `next` of the page
// already on screen.
export async function loadMoreNotifications(tab: string, before: number): Promise<MoreNotifications> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in to see your notifications." }
  if (tab !== "all" && tab !== "mentions") return { ok: false, error: "Open All or Mentions, then try again." }
  if (typeof before !== "number" || !Number.isFinite(before) || before <= 0) {
    return { ok: false, error: "Reload the page to see older notifications." }
  }
  const page = notificationsPage(viewer.id, tab, before, NOTIFICATION_PAGE_SIZE)
  return { ok: true, items: page.items, next: page.next }
}
