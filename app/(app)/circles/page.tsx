import { Suspense, type ReactNode } from "react"
import Link from "next/link"
import { CircleDot } from "lucide-react"
import { requireViewer } from "@/lib/auth"
import { circlesFor, discoverCircles, type Circle } from "@/lib/circles"
import { firstParam } from "@/lib/params"
import { CircleRow } from "@/components/app/circle-bits"
import { emptyActionClass } from "@/components/app/empty-state"
import { PageHeader } from "@/components/app/page-header"
import { cn } from "@/lib/utils"

type SearchParams = Promise<{ q?: string | string[] }>

export default function CirclesPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={null}>
      <CirclesBody searchParams={searchParams} />
    </Suspense>
  )
}

async function CirclesBody({ searchParams }: { searchParams: SearchParams }) {
  const viewer = await requireViewer()
  const query = (firstParam((await searchParams).q) ?? "").trim().slice(0, 60)
  const mine = circlesFor(viewer.id)
  const found = discoverCircles(viewer.id, query)
  return (
    <>
      <PageHeader
        title="Circles"
        subtitle="Small groups, each with its own charter"
        actions={
          <Link href="/circles/new" className={cn(emptyActionClass("primary"), "h-9 px-4 text-sm")}>
            Start a circle
          </Link>
        }
      />
      <form action="/circles" role="search" className="px-4 pt-4">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Search circles by name"
          aria-label="Search circles"
          className="h-11 w-full rounded-full border border-input bg-background px-4 text-[15px] outline-none focus-visible:border-foreground/50"
        />
      </form>
      <Section
        title="Your circles"
        circles={mine}
        empty={
          <span className="flex items-center gap-2">
            <CircleDot className="size-4" aria-hidden="true" />
            You are not in any circle yet. Join one below, or start your own.
          </span>
        }
      />
      <Section
        title={query ? "Circles that match" : "Find a circle"}
        circles={found}
        empty={query ? `No circle is called "${query}" yet.` : "No open circles yet. Start the first one."}
      />
    </>
  )
}

function Section({ title, circles, empty }: { title: string; circles: Circle[]; empty: ReactNode }) {
  return (
    <section>
      <h2 className="px-4 pt-6 pb-2 text-lg font-semibold">{title}</h2>
      {circles.length === 0 ? (
        <p className="px-4 pb-6 text-muted-foreground">{empty}</p>
      ) : (
        <ul className="list-none">
          {circles.map((circle) => (
            <CircleRow key={circle.id} circle={circle} />
          ))}
        </ul>
      )}
    </section>
  )
}
