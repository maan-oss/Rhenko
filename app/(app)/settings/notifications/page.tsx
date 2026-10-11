import { Suspense } from "react"
import { requireViewer } from "@/lib/auth"
import { mentionsVerifiedOnly } from "@/lib/data"
import { NOTIFICATION_KINDS, NOTIFICATION_LABELS, notificationPrefsFor } from "@/lib/settings-data"
import { NotificationPrefs } from "@/components/app/notification-prefs"
import { MentionFilterChoice } from "@/components/app/mention-filter"
import { PageHeader } from "@/components/app/page-header"

export default function NotificationSettingsPage() {
  return (
    <Suspense fallback={null}>
      <NotificationBody />
    </Suspense>
  )
}

async function NotificationBody() {
  const viewer = await requireViewer()
  const prefs = notificationPrefsFor(viewer.id)
  const rows = NOTIFICATION_KINDS.map((kind) => ({
    kind,
    title: NOTIFICATION_LABELS[kind].title,
    hint: NOTIFICATION_LABELS[kind].hint,
    enabled: prefs[kind],
  }))
  return (
    <>
      <PageHeader title="Notifications" backHref="/settings" />
      <div className="px-4 py-2">
        <NotificationPrefs rows={rows} />
      </div>
      <section className="flex flex-col gap-3 border-t border-border px-4 py-6">
        <h2 className="text-lg font-semibold">Mentions</h2>
        <MentionFilterChoice initial={mentionsVerifiedOnly(viewer.id)} />
      </section>
    </>
  )
}
