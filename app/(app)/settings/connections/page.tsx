import { Suspense } from "react"
import Link from "@/components/app/link"
import { requireViewer } from "@/lib/auth"
import { dismissedCount, settingsFor } from "@/lib/connections"
import { ConnectionSettings } from "@/components/app/connection-settings"
import { PageHeader } from "@/components/app/page-header"

export default function ConnectionsSettingsPage() {
  return (
    <Suspense fallback={null}>
      <ConnectionsBody />
    </Suspense>
  )
}

async function ConnectionsBody() {
  const viewer = await requireViewer()
  const settings = await settingsFor(viewer.id)
  return (
    <>
      <PageHeader title="Connections and languages" backHref="/settings" />
      <div className="border-b border-border px-4 py-5">
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          Change any of this at any time. Your town is never shown on your profile.{" "}
          <Link href="/transparency#connections" className="font-semibold text-foreground underline underline-offset-4">
            How suggestions work
          </Link>
        </p>
      </div>
      <ConnectionSettings
        initial={{
          where: { country: settings.country, area: settings.area, region: settings.region, suggestNearby: settings.suggestNearby },
          languages: { speak: settings.speak, learn: settings.learn, suggestLanguage: settings.suggestLanguage },
        }}
        dismissed={await dismissedCount(viewer.id)}
      />
      <div className="px-4 pt-2 pb-6">
        <Link href="/welcome" className="text-sm font-semibold underline underline-offset-4">
          Go through the setup steps again
        </Link>
      </div>
    </>
  )
}
