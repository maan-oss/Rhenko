import { Suspense } from "react"
import { currentSessionHash, requireViewer } from "@/lib/auth"
import { mentionsVerifiedOnly } from "@/lib/data"
import { followedAccountsForPriority, MAX_PRIORITY_ACCOUNTS } from "@/lib/priority-accounts"
import { messagePreviewsOn, pushDevicesFor, vapidPublicKey } from "@/lib/push"
import { NOTIFICATION_KINDS, NOTIFICATION_LABELS, notificationPrefsFor } from "@/lib/settings-data"
import { NotificationPrefs } from "@/components/app/notification-prefs"
import { MentionFilterChoice } from "@/components/app/mention-filter"
import { PriorityAccounts } from "@/components/app/priority-accounts"
import { PushSettings } from "@/components/app/push-settings"
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
  const prefs = await notificationPrefsFor(viewer.id)
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
      <section className="flex flex-col gap-3 border-t border-border px-4 py-4">
        <h2 className="text-lg font-semibold">Push notifications</h2>
        <p className="text-sm text-muted-foreground">
          Alerts on your phone or computer when Rhenko is closed. They follow the switches above, and a muted account or conversation sends none.
        </p>
        <PushSettings
          publicKey={vapidPublicKey()}
          devices={await pushDevicesFor(viewer.id, await currentSessionHash())}
          previews={await messagePreviewsOn(viewer.id)}
        />
      </section>
      <section className="flex flex-col gap-3 border-t border-border px-4 py-4">
        <h2 className="text-lg font-semibold">Mentions</h2>
        <MentionFilterChoice initial={await mentionsVerifiedOnly(viewer.id)} />
      </section>
      <section className="flex flex-col gap-3 border-t border-border px-4 py-4">
        <h2 className="text-lg font-semibold">Priority</h2>
        <p className="text-sm text-muted-foreground">
          Choose accounts you follow. Their likes, replies, posts, follows and mentions also show in the Priority tab of notifications.
        </p>
        <PriorityAccounts initial={await followedAccountsForPriority(viewer.id)} limit={MAX_PRIORITY_ACCOUNTS} />
      </section>
    </>
  )
}
