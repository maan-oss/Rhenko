import { Suspense } from "react"
import Link from "@/components/app/link"
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
  const suggestions = await suggestionsFor(viewer.id, await clock(), 6)
  const settings = await settingsFor(viewer.id)
  const groups = suggestions.groups.filter((group) => group.people.length > 0)

  // What is missing, each with the one thing that fixes it. Settings is where both are changed.
  const missing: { text: string; action: string }[] = []
  if (settings.country === "" || settings.area === "") missing.push({ text: "Add your city or town to see people nearby.", action: "Add" })
  else if (!settings.suggestNearby) missing.push({ text: "Nearby suggestions are off.", action: "Turn on" })
  if (settings.speak.length === 0 && settings.learn.length === 0) missing.push({ text: "Add a language to find partners.", action: "Add" })
  else if (!settings.suggestLanguage) missing.push({ text: "Language suggestions are off.", action: "Turn on" })

  return (
    <>
      <PageHeader title="Connect" />

      {groups.length === 0 ? (
        <EmptyState title="Nobody to show yet" body="Add where you are and your languages to find people.">
          <Link href="/welcome" className={emptyActionClass("primary")}>
            Set up
          </Link>
        </EmptyState>
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

      {missing.length > 0 ? (
        <section aria-label="To finish" className="px-4 pt-4 pb-6">
          <ul className="divide-y divide-border rounded-2xl border border-border">
            {missing.map((item) => (
              <li key={item.text} className="flex items-center justify-between gap-4 px-4 py-3.5">
                <span className="text-[14px] leading-snug">{item.text}</span>
                <Link href="/settings/connections" className="tap-44 shrink-0 text-[14px] font-semibold underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground">
                  {item.action}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  )
}
