import type { Metadata } from "next"
import { Suspense } from "react"
import { redirect } from "next/navigation"
import { getViewer } from "@/lib/auth"
import { all } from "@/lib/db"
import { settingsFor } from "@/lib/connections"
import { TERMS_VERSION } from "@/lib/legal"
import { SetupFlow } from "@/components/app/setup-flow"

export const metadata: Metadata = {
  title: { absolute: "Set up your connections · Rhenko" },
  robots: { index: false, follow: false },
}

// The steps after sign-up: where you are, your languages, your topics, and the first people to meet. Each step can be
// skipped. The Home prompt only appears while setup is pending; this page stays open for anyone who wants to fill in more.
export default function WelcomePage() {
  return (
    <Suspense fallback={null}>
      <WelcomeBody />
    </Suspense>
  )
}

async function WelcomeBody() {
  const viewer = await getViewer()
  if (!viewer) redirect("/login")
  if (viewer.termsVersion !== TERMS_VERSION) redirect("/accept-terms")
  const settings = settingsFor(viewer.id)
  const topics = all<{ tag: string }>("SELECT tag FROM topic_follows WHERE user_id = ? ORDER BY created_at", viewer.id).map((row) => row.tag)
  return (
    <SetupFlow
      initial={{
        where: { country: settings.country, area: settings.area, suggestNearby: settings.suggestNearby },
        languages: { speak: settings.speak, learn: settings.learn, suggestLanguage: settings.suggestLanguage },
        topics,
      }}
    />
  )
}
