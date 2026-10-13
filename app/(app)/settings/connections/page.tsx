import { Suspense } from "react"
import Link from "next/link"
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
  const settings = settingsFor(viewer.id)
  return (
    <>
      <PageHeader title="Connections and languages" backHref="/settings" />
      <div className="border-b border-border px-4 py-5">
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          What you set here decides who can be suggested to you, and who you are suggested to. Nothing is shown to anyone else
          unless it is already public on your profile.{" "}
          <Link href="/transparency#connections" className="font-semibold text-foreground underline underline-offset-4">
            How suggestions work
          </Link>
        </p>
      </div>
      <ConnectionSettings
        initial={{
          where: { country: settings.country, area: settings.area, suggestNearby: settings.suggestNearby },
          languages: { speak: settings.speak, learn: settings.learn, suggestLanguage: settings.suggestLanguage },
        }}
        dismissed={dismissedCount(viewer.id)}
      />
      <div className="px-4 pt-2 pb-10">
        <Link href="/welcome" className="text-sm font-semibold underline underline-offset-4">
          Go through the setup steps again
        </Link>
      </div>
    </>
  )
}
