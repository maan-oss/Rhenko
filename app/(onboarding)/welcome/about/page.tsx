import type { Metadata } from "next"
import { Suspense } from "react"
import { redirect } from "next/navigation"
import { getViewer } from "@/lib/auth"
import { all, get } from "@/lib/db"
import { settingsFor } from "@/lib/connections"
import { TERMS_VERSION } from "@/lib/legal"
import { AboutSetup } from "@/components/app/about-setup"

export const metadata: Metadata = {
  title: { absolute: "About you · Rhenko" },
  robots: { index: false, follow: false },
}

// The second setup screen: where someone is, and their interests. It stays open for anyone who wants to come back to it.
export default function WelcomeAboutPage() {
  return (
    <Suspense fallback={null}>
      <AboutBody />
    </Suspense>
  )
}

async function AboutBody() {
  const viewer = await getViewer()
  if (!viewer) redirect("/login")
  if (viewer.termsVersion !== TERMS_VERSION) redirect("/accept-terms")
  const profile = get<{ location: string | null; website: string | null }>("SELECT location, website FROM users WHERE id = ?", viewer.id)
  if (!profile) redirect("/login")
  const topics = all<{ tag: string }>("SELECT tag FROM topic_follows WHERE user_id = ? ORDER BY created_at", viewer.id).map((row) => row.tag)
  const settings = settingsFor(viewer.id)
  return (
    <AboutSetup
      initial={{
        location: profile.location ?? "",
        website: profile.website ?? "",
        where: { country: settings.country, area: settings.area, suggestNearby: settings.suggestNearby },
        topics,
      }}
    />
  )
}
