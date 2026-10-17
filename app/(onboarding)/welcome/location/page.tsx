import type { Metadata } from "next"
import { Suspense } from "react"
import { redirect } from "next/navigation"
import { getViewer } from "@/lib/auth"
import { get } from "@/lib/db"
import { settingsFor } from "@/lib/connections"
import { TERMS_VERSION } from "@/lib/legal"
import { LocationSetup } from "@/components/app/location-setup"

export const metadata: Metadata = {
  title: { absolute: "Where you are · Rhenko" },
  robots: { index: false, follow: false },
}

// The second setup screen: where someone is. It stays open for anyone who wants to come back to it.
export default function WelcomeLocationPage() {
  return (
    <Suspense fallback={null}>
      <LocationBody />
    </Suspense>
  )
}

async function LocationBody() {
  const viewer = await getViewer()
  if (!viewer) redirect("/login")
  if (viewer.termsVersion !== TERMS_VERSION) redirect("/accept-terms")
  const profile = await get<{ location: string | null; website: string | null }>("SELECT location, website FROM users WHERE id = ?", viewer.id)
  if (!profile) redirect("/login")
  const settings = await settingsFor(viewer.id)
  return (
    <LocationSetup
      initial={{
        location: profile.location ?? "",
        website: profile.website ?? "",
        where: { country: settings.country, area: settings.area, region: settings.region, suggestNearby: settings.suggestNearby },
      }}
    />
  )
}
