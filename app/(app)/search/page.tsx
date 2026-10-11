import { Suspense } from "react"
import Link from "next/link"
import { requireViewer } from "@/lib/auth"
import { parseSearch, searchUsers } from "@/lib/data"
import { feedFor, type FeedSpec } from "@/lib/feeds"
import { firstParam } from "@/lib/params"
import { FeedList } from "@/components/app/feed-list"
import { PageHeader } from "@/components/app/page-header"
import { PeopleList } from "@/components/app/people-list"
import { ScrollTabs } from "@/components/app/scroll-tabs"
import { SearchField } from "@/components/app/search-field"

type SearchParams = Promise<{ q?: string | string[]; f?: string | string[] }>

const TYPES = [
  { key: "top", label: "Top" },
  { key: "latest", label: "Latest" },
  { key: "people", label: "People" },
  { key: "media", label: "Media" },
] as const

export default function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={null}>
      <SearchBody searchParams={searchParams} />
    </Suspense>
  )
}

async function SearchBody({ searchParams }: { searchParams: SearchParams }) {
  const viewer = await requireViewer()
  const params = await searchParams
  const q = (firstParam(params.q) ?? "").slice(0, 300).trim()
  const requested = firstParam(params.f)
  const type = TYPES.find((t) => t.key === requested)?.key ?? "top"

  return (
    <>
      <PageHeader title={q ? q : "Search"} backHref="/explore" />
      <SearchField defaultQuery={q} type={type} />
      {q ? (
        <ScrollTabs
          items={TYPES.map((t) => ({
            href: `/search?q=${encodeURIComponent(q)}&f=${t.key}`,
            label: t.label,
            active: t.key === type,
          }))}
        />
      ) : null}
      {q ? <Results q={q} type={type} viewerId={viewer.id} viewer={viewer} /> : <SearchHelp />}
    </>
  )
}

async function Results({ q, type, viewerId, viewer }: { q: string; type: (typeof TYPES)[number]["key"]; viewerId: string; viewer: Awaited<ReturnType<typeof requireViewer>> }) {
  if (type === "people") {
    const terms = parseSearch(q).terms.join(" ")
    const users = terms ? searchUsers(terms, viewerId, 40) : []
    return <PeopleList users={users} viewerId={viewerId} removable={false} emptyText={`No people match “${q}”.`} />
  }
  const spec: FeedSpec =
    type === "media"
      ? { kind: "search", q: `${q} filter:media`, sort: "latest" }
      : { kind: "search", q, sort: type === "latest" ? "latest" : "top" }
  const page = feedFor(spec, viewerId)
  return (
    <FeedList
      key={type}
      items={page.items}
      next={page.next}
      spec={spec}
      viewer={viewer}
      emptyTitle={`No results for “${q}”`}
      emptyBody="Check the spelling, or try a different word or operator."
    />
  )
}

function SearchHelp() {
  return (
    <div className="flex flex-col gap-3 px-4 py-10">
      <p className="text-lg font-semibold">Search Rhenko</p>
      <p className="text-muted-foreground">Search posts by words, a #topic, or a $cashtag. Narrow the results with these operators:</p>
      <ul className="flex list-none flex-col gap-2 text-[15px]">
        <li>
          <code className="rounded bg-muted px-1.5 py-0.5">from:handle</code> posts by one person
        </li>
        <li>
          <code className="rounded bg-muted px-1.5 py-0.5">since:2026-01-01</code> and <code className="rounded bg-muted px-1.5 py-0.5">until:2026-06-30</code> a date range
        </li>
        <li>
          <code className="rounded bg-muted px-1.5 py-0.5">filter:images</code>, <code className="rounded bg-muted px-1.5 py-0.5">videos</code>,{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">links</code> or <code className="rounded bg-muted px-1.5 py-0.5">replies</code>
        </li>
      </ul>
      <p className="text-sm text-muted-foreground">
        Looking for a topic instead? <Link href="/explore?tab=trending" className="font-semibold text-dusk underline underline-offset-4">Browse trending topics</Link>.
      </p>
    </div>
  )
}
