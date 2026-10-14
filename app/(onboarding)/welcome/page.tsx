import type { Metadata } from "next"
import { Suspense } from "react"
import { redirect } from "next/navigation"
import { getViewer } from "@/lib/auth"
import { get } from "@/lib/db"
import { TERMS_VERSION } from "@/lib/legal"
import { ProfileSetup } from "@/components/app/profile-setup"

export const metadata: Metadata = {
  title: { absolute: "Set up your profile · Rhenko" },
  robots: { index: false, follow: false },
}

// The first setup screen: the profile as people will see it. Continue moves on to About you. The Home prompt only appears
// while setup is pending; these pages stay open for anyone who wants to come back to them.
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
    avatar_file: string | null
    banner_file: string | null
  }>("SELECT name, handle, bio, avatar_file, banner_file FROM users WHERE id = ?", viewer.id)
  if (!profile) redirect("/login")
  return (
    <ProfileSetup
      initial={{
        name: profile.name,
        handle: profile.handle,
        bio: profile.bio ?? "",
        avatarFile: profile.avatar_file,
        bannerFile: profile.banner_file,
      }}
    />
  )
}
