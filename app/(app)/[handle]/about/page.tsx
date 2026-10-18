import Link from "next/link"
import { notFound } from "next/navigation"
import type { ReactNode } from "react"
import { requireViewer } from "@/lib/auth"
import { getProfileByHandle } from "@/lib/data"
import { hostOf, joinedLabel } from "@/lib/format"
import { languageName, SPEAK_LEVELS } from "@/lib/languages"
import { PageHeader } from "@/components/app/page-header"

type Params = Promise<{ handle: string }>

// The details that sit on a profile's About page: where, what languages, a website, and when the account joined. Interests
// are private, so they never appear here.
export const instant = false

export default async function AboutPage({ params }: { params: Params }) {
  const viewer = await requireViewer()
  const { handle } = await params
  const profile = await getProfileByHandle(handle, viewer.id)
  const isSelf = profile?.id === viewer.id
  if (!profile || (profile.deactivated && !isSelf) || profile.relationship.blockedMe) notFound()

  const speaks = profile.languages.speak.map((item) => {
    const name = languageName(item.code) ?? item.code
    const level = SPEAK_LEVELS.find((option) => option.id === item.level)?.label
    return level ? `${name} (${level.toLowerCase()})` : name
  })
  const learns = profile.languages.learn.map((code) => languageName(code) ?? code)
  const base = `/${profile.handle}`

  // Other people see only what is filled in. The owner sees every row, with a note where nothing is set yet.
  const rows: { label: string; value: ReactNode; empty: boolean }[] = [
    {
      label: "Location",
      value: profile.location,
      empty: !profile.location,
    },
    {
      label: "Speaks",
      value: speaks.length > 0 ? speaks.join(", ") : null,
      empty: speaks.length === 0,
    },
    {
      label: "Learning",
      value: learns.length > 0 ? learns.join(", ") : null,
      empty: learns.length === 0,
    },
    {
      label: "Website",
      value: profile.website ? (
        <a href={profile.website} target="_blank" rel="noopener noreferrer nofollow" className="break-words text-foreground underline underline-offset-4 hover:opacity-80">
          {hostOf(profile.website)}
        </a>
      ) : null,
      empty: !profile.website,
    },
    { label: "Joined", value: joinedLabel(profile.createdAt), empty: false },
  ]
  const shown = isSelf ? rows : rows.filter((row) => !row.empty)

  return (
    <>
      <PageHeader title={`About ${profile.name}`} backHref={base} />
      <div className="flex flex-col gap-4 px-4 pt-4 pb-6">
        {shown.length > 0 ? (
          <dl className="grid divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {shown.map((row) => (
              <div key={row.label} className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3 px-4 py-3.5 sm:grid-cols-[9rem_minmax(0,1fr)]">
                <dt className="text-[14px] text-muted-foreground">{row.label}</dt>
                <dd className="min-w-0 text-[15px] leading-snug text-foreground">
                  {row.value ?? <span className="text-muted-foreground">Not set yet</span>}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="rounded-2xl border border-dashed border-border px-4 py-4 text-center text-[15px] text-muted-foreground">
            {profile.name} hasn&apos;t added anything here yet.
          </p>
        )}
        {isSelf ? (
          <Link href="/settings/about" className="self-start text-[15px] font-semibold underline underline-offset-4">
            Edit about you
          </Link>
        ) : null}
      </div>
    </>
  )
}
