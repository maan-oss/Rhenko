import { Suspense } from "react"
import Link from "next/link"
import { requireViewer } from "@/lib/auth"
import { followedTopics, trendingTags, whoToFollow } from "@/lib/data"
import { firstParam } from "@/lib/params"
import { formatCount } from "@/lib/format"
import { PageHeader } from "@/components/app/page-header"
import { PeopleList } from "@/components/app/people-list"
import { ScrollTabs } from "@/components/app/scroll-tabs"
import { SearchField } from "@/components/app/search-field"

type SearchParams = Promise<{ tab?: string | string[] }>

const TABS = [
  { key: "trending", label: "Trending" },
  { key: "topics", label: "Your topics" },
  { key: "people", label: "People" },
] as const

export default function ExplorePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={null}>
      <ExploreBody searchParams={searchParams} />
    </Suspense>
  )
}

async function ExploreBody({ searchParams }: { searchParams: SearchParams }) {
  const viewer = await requireViewer()
  const requested = firstParam((await searchParams).tab)
  const tab = TABS.find((t) => t.key === requested)?.key ?? "trending"

  return (
    <>
      <PageHeader title="Explore" />
      <SearchField defaultQuery="" />
      <ScrollTabs items={TABS.map((t) => ({ href: `/explore?tab=${t.key}`, label: t.label, active: t.key === tab }))} />
      {tab === "trending" ? <Trending /> : null}
      {tab === "topics" ? <Topics viewerId={viewer.id} /> : null}
      {tab === "people" ? <PeopleList users={whoToFollow(viewer.id, 20)} viewerId={viewer.id} removable={false} emptyText="No suggestions right now." /> : null}
    </>
  )
}

function Trending() {
  const tags = trendingTags(20)
  if (tags.length === 0) {
    return <p className="px-4 py-14 text-center text-muted-foreground">Hashtags from the last week show up here.</p>
  }
  return (
    <ol className="list-none">
      {tags.map((item) => (
        <li key={item.tag} className="border-b border-border">
          <Link href={`/topics/${item.tag}`} className="flex flex-col gap-0.5 px-4 py-3 transition-colors hover:bg-muted/50">
            <span className="text-[17px] font-semibold">#{item.tag}</span>
            <span className="text-sm text-muted-foreground">
              {formatCount(item.count)} {item.count === 1 ? "post" : "posts"} this week
            </span>
          </Link>
        </li>
      ))}
    </ol>
  )
}

function Topics({ viewerId }: { viewerId: string }) {
  const tags = followedTopics(viewerId)
  if (tags.length === 0) {
    return <p className="px-4 py-14 text-center text-muted-foreground">Follow a topic from its page and it will show up here.</p>
  }
  return (
    <ul className="list-none">
      {tags.map((tag) => (
        <li key={tag} className="border-b border-border">
          <Link href={`/topics/${tag}`} className="block px-4 py-4 text-[17px] font-semibold transition-colors hover:bg-muted/50">
            #{tag}
          </Link>
        </li>
      ))}
    </ul>
  )
}
