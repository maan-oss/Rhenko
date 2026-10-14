import type { Metadata } from "next"
import { Suspense } from "react"
import { redirect } from "next/navigation"
import { getViewer } from "@/lib/auth"
import { all, get } from "@/lib/db"
import { TERMS_VERSION } from "@/lib/legal"
import { ProfileSetup } from "@/components/app/profile-setup"

export const metadata: Metadata = {
  title: { absolute: "Set up your profile · Rhenko" },
  robots: { index: false, follow: false },
}

// The last onboarding screen: the profile as people will see it, with each part one tap away from changing. The Home
// prompt only appears while setup is pending; this page stays open for anyone who wants to come back to it.
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
  const profile = get<{
    name: string
    handle: string
    bio: string | null
    location: string | null
    website: string | null
    avatar_file: string | null
    banner_file: string | null
  }>("SELECT name, handle, bio, location, website, avatar_file, banner_file FROM users WHERE id = ?", viewer.id)
  if (!profile) redirect("/login")
  const topics = all<{ tag: string }>("SELECT tag FROM topic_follows WHERE user_id = ? ORDER BY created_at", viewer.id).map((row) => row.tag)
  return (
    <ProfileSetup
      initial={{
        name: profile.name,
        handle: profile.handle,
        bio: profile.bio ?? "",
        location: profile.location ?? "",
        website: profile.website ?? "",
        avatarFile: profile.avatar_file,
        bannerFile: profile.banner_file,
        topics,
      }}
    />
  )
}
