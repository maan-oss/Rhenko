import Link from "next/link"
import { requireViewer } from "@/lib/auth"
import { all, get } from "@/lib/db"
import { AboutSettings } from "@/components/app/about-settings"
import { PageHeader } from "@/components/app/page-header"

// About you: the details on the About page (location and website) and the interests that fill the feed. Interests are
// private. Where you are for suggestions, and your languages, are on Connections and languages.
export default async function AboutSettingsPage() {
  const viewer = await requireViewer()
  const profile = await get<{ location: string | null; website: string | null; handle: string }>(
    "SELECT location, website, handle FROM users WHERE id = ?",
    viewer.id
  )
  const topics = (await all<{ tag: string }>("SELECT tag FROM topic_follows WHERE user_id = ? ORDER BY created_at", viewer.id)).map((row) => row.tag)
  return (
    <>
      <PageHeader title="About you" backHref="/settings" />
      <AboutSettings
        initial={{ location: profile?.location ?? "", website: profile?.website ?? "", topics }}
        handle={profile?.handle ?? ""}
      />
      <div className="flex flex-col gap-2 px-4 pt-5 pb-6 text-[15px]">
        <Link href="/settings/connections" className="font-semibold underline underline-offset-4">
          Where you are for suggestions, and your languages
        </Link>
      </div>
    </>
  )
}
