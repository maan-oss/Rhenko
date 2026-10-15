import type { Metadata } from "next"
import { Suspense } from "react"
import { redirect } from "next/navigation"
import { getViewer } from "@/lib/auth"
import { all } from "@/lib/db"
import { TERMS_VERSION } from "@/lib/legal"
import { InterestsSetup } from "@/components/app/interests-setup"

export const metadata: Metadata = {
  title: { absolute: "What you're into · Rhenko" },
  robots: { index: false, follow: false },
}

// The last setup screen: interests. It stays open for anyone who wants to come back to it.
export default function WelcomeInterestsPage() {
  return (
    <Suspense fallback={null}>
      <InterestsBody />
    </Suspense>
  )
}

async function InterestsBody() {
  const viewer = await getViewer()
  if (!viewer) redirect("/login")
  if (viewer.termsVersion !== TERMS_VERSION) redirect("/accept-terms")
  const topics = all<{ tag: string }>("SELECT tag FROM topic_follows WHERE user_id = ? ORDER BY created_at", viewer.id).map((row) => row.tag)
  return <InterestsSetup initial={topics} />
}
