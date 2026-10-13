import { Suspense } from "react"
import Link from "next/link"
import { connection } from "next/server"
import { requireViewer } from "@/lib/auth"
import { settingsFor, suggestionsFor } from "@/lib/connections"
import { ConnectionCard } from "@/components/app/connection-card"
import { EmptyState, emptyActionClass } from "@/components/app/empty-state"
import { PageHeader } from "@/components/app/page-header"

export default function ConnectPage() {
  return (
    <Suspense fallback={null}>
      <ConnectBody />
    </Suspense>
  )
}

// People to connect with, in groups. Each card gives its reason. Nothing here is a feed post, and nobody is told they
// were suggested to someone else.
// The time the page is read. Read after connection(), so the page is never built with a fixed clock.
async function clock(): Promise<number> {
  await connection()
  return Date.now()
}

async function ConnectBody() {
  const viewer = await requireViewer()
  const suggestions = suggestionsFor(viewer.id, await clock(), 6)
  const settings = settingsFor(viewer.id)
  const groups = suggestions.groups.filter((group) => group.people.length > 0)

  // Says what is missing, in one short line each.
  const missing: string[] = []
  if (settings.country === "" || settings.area === "") missing.push("Add your city or town to see people nearby.")
  else if (!settings.suggestNearby) missing.push("Nearby suggestions are off.")
  if (settings.speak.length === 0 && settings.learn.length === 0) missing.push("Add a language to find language partners.")
  else if (!settings.suggestLanguage) missing.push("Language suggestions are off.")

  return (
    <>
      <PageHeader title="Connect" />
      <div className="flex flex-col gap-4 border-b border-border px-4 py-5">
        <p className="text-[15px] leading-relaxed text-muted-foreground">Each card says why that person is here.</p>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold">
          <Link href="/settings/connections" className="underline-offset-4 hover:underline">
            Where you are and your languages
          </Link>
          <Link href="/transparency#connections" className="underline-offset-4 hover:underline">
            How suggestions work
          </Link>
        </div>
      </div>

      {groups.length === 0 ? (
        <EmptyState title="Nobody to show yet" body="People appear here as they join. Add your city and languages to find people near you.">
          <Link href="/welcome" className={emptyActionClass("primary")}>
            Set up step by step
          </Link>
        </EmptyState>
      ) : null}

      {groups.map((group) => (
        <section key={group.group} aria-labelledby={`group-${group.group}`} className="border-b border-border">
          <div className="px-4 pt-5 pb-3">
            <h2 id={`group-${group.group}`} className="text-[18px] font-semibold tracking-tight">
              {group.title}
            </h2>
            <p className="text-sm text-muted-foreground">{group.description}</p>
          </div>
          <ul className="divide-y divide-border">
            {group.people.map((person) => (
              <ConnectionCard key={`${group.group}-${person.id}`} person={person} />
            ))}
          </ul>
        </section>
      ))}

      {missing.length > 0 ? (
        <section aria-label="What is missing" className="flex flex-col gap-2 px-4 py-6 text-[14px] leading-relaxed text-muted-foreground">
          {missing.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </section>
      ) : null}
    </>
  )
}
