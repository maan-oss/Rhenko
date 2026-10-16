import { Suspense } from "react"
import Link from "next/link"
import { Clock, Flame, Image as ImageIcon, List as ListIcon, Lock, Users } from "lucide-react"
import { requireViewer, type Viewer } from "@/lib/auth"
import { parseSearch, recentSearches, savedSearches, searchLists, searchUsers, type ListSummary } from "@/lib/data"
import { formatCount } from "@/lib/format"
import { listOwnersVisibleTo } from "@/lib/people-state"
import { recordSearch } from "@/lib/search-history"
import { feedFor, type FeedSpec } from "@/lib/feeds"
import { firstParam } from "@/lib/params"
import { EmptyState, emptyActionClass } from "@/components/app/empty-state"
import { FeedList } from "@/components/app/feed-list"
import { PageHeader } from "@/components/app/page-header"
import { PeopleList } from "@/components/app/people-list"
import { RecentSearches } from "@/components/app/recent-searches"
import { SaveSearchButton, SavedSearches } from "@/components/app/saved-searches"
import { TabLinks } from "@/components/app/tabs"
import { SearchField } from "@/components/app/search-field"

type SearchParams = Promise<{ q?: string | string[]; f?: string | string[] }>

const TYPES = [
  { key: "top", label: "Top", icon: <Flame /> },
  { key: "latest", label: "Latest", icon: <Clock /> },
  { key: "people", label: "People", icon: <Users /> },
  { key: "media", label: "Media", icon: <ImageIcon /> },
  { key: "lists", label: "Lists", icon: <ListIcon /> },
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
  if (q) recordSearch(viewer.id, q)
  const saved = savedSearches(viewer.id)

  return (
    <>
      <PageHeader title={q ? q : "Search"} backHref="/explore" />
      <SearchField defaultQuery={q} type={type} />
      {q ? (
        <>
          {/* The tabs run the full width of the column, with their rule across it, as X sets them. */}
          <TabLinks
            label="Search results"
            items={TYPES.map((t) => ({
              href: searchHref(q, t.key),
              label: t.label,
              icon: t.icon,
              active: t.key === type,
            }))}
          />
          <div className="flex justify-end px-4 pt-2">
            <SaveSearchButton query={q} saved={saved.includes(q)} />
          </div>
        </>
      ) : null}
      {q ? (
        <>
          <Results q={q} type={type} viewer={viewer} />
        </>
      ) : (
        <SearchHelp recent={recentSearches(viewer.id)} saved={saved} />
      )}
    </>
  )
}

// What a search with nothing found offers next: the same words in another kind of search, or a way to find something else.
function searchHref(q: string, type: (typeof TYPES)[number]["key"]): string {
  return `/search?q=${encodeURIComponent(q)}&f=${type}`
}

function NoPeople({ q, hasTerms }: { q: string; hasTerms: boolean }) {
  return (
    <EmptyState
      title={hasTerms ? `No people match “${q}”` : "Search people by name"}
      body={hasTerms ? "Try a name or a handle, or search posts for the same words." : "Operators like from: work on posts. To find people, type a name or a handle."}
    >
      <Link href={searchHref(q, "top")} className={emptyActionClass("primary")}>
        Search posts
      </Link>
      <Link href="/explore?tab=trending" className={emptyActionClass("secondary")}>
        Browse trending topics
      </Link>
    </EmptyState>
  )
}

async function Results({ q, type, viewer }: { q: string; type: (typeof TYPES)[number]["key"]; viewer: Viewer }) {
  if (type === "lists") {
    const terms = parseSearch(q).terms.join(" ")
    const found = terms ? searchLists(terms, viewer.id) : []
    // A list whose owner has blocked the viewer, or whose account is gone, stays out of the results.
    const visible = listOwnersVisibleTo(viewer.id, found.map((list) => list.owner.id))
    const lists = found.filter((list) => list.owner.id === viewer.id || visible.has(list.owner.id))
    if (lists.length === 0) return <NoLists q={q} hasTerms={terms !== ""} />
    return <ListResults lists={lists} />
  }
  if (type === "people") {
    const terms = parseSearch(q).terms.join(" ")
    const users = terms ? searchUsers(terms, viewer.id, 40) : []
    if (users.length === 0) return <NoPeople q={q} hasTerms={terms !== ""} />
    return <PeopleList users={users} viewerId={viewer.id} removable={false} emptyText="" />
  }
  const media = type === "media"
  const spec: FeedSpec = media ? { kind: "search", q: `${q} filter:media`, sort: "latest" } : { kind: "search", q, sort: type === "latest" ? "latest" : "top" }
  const page = feedFor(spec, viewer.id)
  const empty = page.items.length === 0 && !page.next
  return (
    <FeedList
      key={type}
      items={page.items}
      next={page.next}
      spec={spec}
      viewer={viewer}
      emptyTitle={media ? `No photos or videos for “${q}”` : `No results for “${q}”`}
      emptyBody={media ? "Posts with photos or videos that match your words show up here." : "Check the spelling, or try a different word or operator."}
      emptyAction={
        empty ? (
          media ? (
            <Link href={searchHref(q, "top")} className={emptyActionClass("primary")}>
              Search all posts
            </Link>
          ) : (
            <>
              <Link href={searchHref(q, "people")} className={emptyActionClass("primary")}>
                Search people
              </Link>
              <Link href="/explore?tab=trending" className={emptyActionClass("secondary")}>
                Browse trending topics
              </Link>
            </>
          )
        ) : undefined
      }
    />
  )
}

function NoLists({ q, hasTerms }: { q: string; hasTerms: boolean }) {
  return (
    <EmptyState
      title={hasTerms ? `No lists match “${q}”` : "Search lists by name"}
      body={hasTerms ? "Lists are groups of accounts. Try a shorter name, or search posts for the same words." : "Type a name to find a list."}
    >
      <Link href={searchHref(q, "top")} className={emptyActionClass("primary")}>
        Search posts
      </Link>
    </EmptyState>
  )
}

function ListResults({ lists }: { lists: ListSummary[] }) {
  return (
    <ul className="list-none">
      {lists.map((list) => (
        <li key={list.id} className="border-b border-border">
          <Link href={`/lists/${list.id}`} className="flex flex-col gap-1 px-4 py-4 transition-colors hover:bg-muted/50">
            <span className="flex items-center gap-2 text-[17px] font-semibold">
              {list.name}
              {list.private ? <Lock className="size-3.5 text-muted-foreground" aria-label="Private" /> : null}
            </span>
            {list.description ? <span className="text-[15px] text-muted-foreground">{list.description}</span> : null}
            <span className="text-sm text-muted-foreground">
              {formatCount(list.memberCount)} {list.memberCount === 1 ? "member" : "members"} · by @{list.owner.handle}
            </span>
          </Link>
        </li>
      ))}
    </ul>
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

function SearchHelp({ recent, saved }: { recent: string[]; saved: string[] }) {
  return (
    <div className="flex flex-col gap-6 px-4 py-6">
      <SavedSearches queries={saved} />
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
      <div className="flex flex-col items-start gap-2">
        <p className="text-sm text-muted-foreground">Looking for a topic instead?</p>
        <Link href="/explore?tab=trending" className={emptyActionClass("secondary")}>
          Browse trending topics
        </Link>
      </div>
    </div>
  )
}
