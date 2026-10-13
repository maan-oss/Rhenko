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

  // Says what is missing, so an empty group is never a mystery.
  const missing: string[] = []
  if (settings.country === "" || settings.area === "") missing.push("Add your city or town to see people nearby.")
  else if (!settings.suggestNearby) missing.push("Nearby suggestions are off, so nobody is suggested for where they are.")
  if (settings.speak.length === 0 && settings.learn.length === 0) missing.push("Add the languages you speak or are learning to find language partners.")
  else if (!settings.suggestLanguage) missing.push("Language suggestions are off, so nobody is suggested as a language partner.")

  return (
    <>
      <PageHeader title="Connect" />
      <div className="flex flex-col gap-4 border-b border-border px-4 py-5">
        <p className="text-[15px] leading-relaxed">
          People near you, people who speak your languages or are learning them, and people who write about what you follow. Each
          card says why it is here.
        </p>
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
        <EmptyState
          title={suggestions.hasArea || suggestions.hasLanguages ? "Nobody matches yet" : "Start with where you are"}
          body={
            suggestions.hasArea || suggestions.hasLanguages
              ? "People show up here as they join, and as they post about the topics you follow."
              : "Add your city or town and the languages you speak. Then people near you and language partners can appear here."
          }
        >
          {suggestions.hasArea && suggestions.hasLanguages ? null : (
            <Link href="/welcome" className={emptyActionClass("primary")}>
              Set up step by step
            </Link>
          )}
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
