import { Suspense } from "react"
import Link from "next/link"
import { requireViewer } from "@/lib/auth"
import { parseSearch, recentSearches, searchUsers } from "@/lib/data"
import { feedFor, type FeedSpec } from "@/lib/feeds"
import { firstParam } from "@/lib/params"
import { FeedList } from "@/components/app/feed-list"
import { PageHeader } from "@/components/app/page-header"
import { PeopleList } from "@/components/app/people-list"
import { RecentSearches, RememberSearch } from "@/components/app/recent-searches"
import { TabLinks } from "@/components/app/tabs"
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
        <TabLinks
          items={TYPES.map((t) => ({
            href: `/search?q=${encodeURIComponent(q)}&f=${t.key}`,
            label: t.label,
            active: t.key === type,
          }))}
        />
      ) : null}
      {q ? (
        <>
          <RememberSearch query={q} />
          <Results q={q} type={type} viewerId={viewer.id} viewer={viewer} />
        </>
      ) : (
        <SearchHelp recent={recentSearches(viewer.id)} />
      )}
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

const OPERATORS: { syntax: string; meaning: string }[] = [
  { syntax: "from:handle", meaning: "Posts by one person" },
  { syntax: "to:handle", meaning: "Replies to one person" },
  { syntax: "since:2026-01-01 until:2026-06-30", meaning: "A date range" },
  { syntax: "filter:images", meaning: "Also videos, media, links or replies" },
  { syntax: "min_likes:10", meaning: "Posts with at least this many likes" },
  { syntax: "min_reposts:5", meaning: "Posts with at least this many reposts" },
  { syntax: "-word", meaning: "Leave out posts that contain a word" },
]

function SearchHelp({ recent }: { recent: string[] }) {
  return (
    <div className="flex flex-col gap-6 px-4 py-6">
      <RecentSearches queries={recent} />
      <div className="flex flex-col gap-3">
        <p className="text-lg font-semibold">Search Rhenko</p>
        <p className="text-muted-foreground">Search posts by words or a #topic, and narrow the results with operators:</p>
        <ul className="flex list-none flex-col gap-2.5 text-[15px]">
          {OPERATORS.map((operator) => (
            <li key={operator.syntax} className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
              <code className="w-fit rounded bg-muted px-1.5 py-0.5 text-[13px]">{operator.syntax}</code>
              <span className="text-muted-foreground">{operator.meaning}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-sm text-muted-foreground">
        Looking for a topic instead?{" "}
        <Link href="/explore?tab=trending" className="font-semibold text-dusk underline underline-offset-4">
          Browse trending topics
        </Link>
        .
      </p>
    </div>
  )
}
