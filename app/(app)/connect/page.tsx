import { connection } from "next/server"
import { requireViewer } from "@/lib/auth"
import { settingsFor, suggestionsFor } from "@/lib/connections"
import { ConnectionCard } from "@/components/app/connection-card"
import { EmptyState } from "@/components/app/empty-state"
import { PageHeader } from "@/components/app/page-header"
import { LanguageSection, WhereSection } from "@/components/app/connection-settings"
import { RevealSuspense } from "@/components/app/reveal-suspense"

export default function ConnectPage() {
  return (
    <RevealSuspense>
      <ConnectBody />
    </RevealSuspense>
  )
}

// The time the page is read. Read after connection(), so the page is never built with a fixed clock.
async function clock(): Promise<number> {
  await connection()
  return Date.now()
}

// People to connect with, in groups. Each card gives its reason. Nothing here is a feed post, and nobody is told they
// were suggested to someone else. Someone who has added nothing yet sees the adding page instead, and no one else. Where
// and languages are changed here or in Settings.
async function ConnectBody() {
  const viewer = await requireViewer()
  const settings = await settingsFor(viewer.id)
  const nothingAdded = settings.country === "" && settings.area === "" && settings.speak.length === 0 && settings.learn.length === 0

  if (nothingAdded) {
    return (
      <>
        <PageHeader title="Connect" />
        <div className="border-b border-border px-4 py-5">
          <p className="text-[15px] leading-relaxed text-muted-foreground">
            Add where you are and the languages you speak. Connect then shows people nearby and people to practise with.
          </p>
        </div>
        <WhereSection initial={{ country: settings.country, area: settings.area, region: settings.region, suggestNearby: settings.suggestNearby }} />
        <LanguageSection initial={{ speak: settings.speak, learn: settings.learn, suggestLanguage: settings.suggestLanguage }} />
      </>
    )
  }

  const suggestions = await suggestionsFor(viewer.id, await clock(), 6)
  const groups = suggestions.groups.filter((group) => group.people.length > 0)

  return (
    <>
      <PageHeader title="Connect" />

      {groups.length === 0 ? (
        <EmptyState title="Nobody to show yet" body="No one matches you yet. Check back as more people join." />
      ) : null}

      {groups.map((group) => (
        <section key={group.group} aria-labelledby={`group-${group.group}`} className="border-b border-border">
          <div className="px-4 pt-4 pb-2">
            <h2 id={`group-${group.group}`} className="text-[17px] font-semibold tracking-tight">
              {group.title}
            </h2>
            <p className="text-[14px] text-muted-foreground">{group.description}</p>
          </div>
          <ul className="divide-y divide-border">
            {group.people.map((person) => (
              <ConnectionCard key={`${group.group}-${person.id}`} person={person} />
            ))}
          </ul>
        </section>
      ))}
    </>
  )
}
