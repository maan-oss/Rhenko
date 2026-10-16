import { Suspense } from "react"
import Link from "next/link"
import { ChevronRight, Newspaper, TrendingUp, Users } from "lucide-react"
import { requireViewer, type Viewer } from "@/lib/auth"
import { starterPacks, trendingTags } from "@/lib/data"
import { feedFor, type FeedSpec } from "@/lib/feeds"
import { formatCount } from "@/lib/format"
import { listOwnersVisibleTo } from "@/lib/people-state"
import { firstParam } from "@/lib/params"
import { ComposeAction } from "@/components/app/compose-action"
import { EmptyState, emptyActionClass } from "@/components/app/empty-state"
import { PackList } from "@/components/app/pack-list"
import { PageHeader } from "@/components/app/page-header"
import { FeedList } from "@/components/app/feed-list"
import { MediaSwitch, RankingButton } from "@/components/app/explore-controls"
import { SearchField } from "@/components/app/search-field"
import { TabLinks } from "@/components/app/tabs"

type SearchParams = Promise<{ tab?: string | string[]; sort?: string | string[]; media?: string | string[] }>

// How many topics the Trending tab lists.
const TRENDING_LIMIT = 30
// How many starter packs the Packs tab lists.
const PACKS_LIMIT = 30

export default function ExplorePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={null}>
      <ExploreBody searchParams={searchParams} />
    </Suspense>
  )
}

// Explore has two tabs. Posts is everyone's posts, ranked or latest first, optionally only those with photos or videos.
// Trending is the topics people used most this week. The tab, the order and the media switch all live in the address.
async function ExploreBody({ searchParams }: { searchParams: SearchParams }) {
  const viewer = await requireViewer()
  const params = await searchParams
  const requestedTab = firstParam(params.tab)
  const trending = requestedTab === "trending"
  const packs = requestedTab === "packs"
  const sort = firstParam(params.sort) === "latest" ? "latest" : "top"
  const media = firstParam(params.media) === "1"

  const href = (next: { sort: "top" | "latest"; media: boolean }) => {
    const query = new URLSearchParams()
    if (next.sort === "latest") query.set("sort", "latest")
    if (next.media) query.set("media", "1")
    const search = query.toString()
    return search ? `/explore?${search}` : "/explore"
  }

  return (
    <>
      <PageHeader
        title="Explore"
        tabs={
          <TabLinks
            items={[
              { href: "/explore", label: "Posts", icon: <Newspaper />, active: !trending },
              { href: "/explore?tab=trending", label: "Trending", icon: <TrendingUp />, active: trending },
              { href: "/explore?tab=packs", label: "Packs", icon: <Users />, active: packs },
            ]}
          />
        }
      />
      {packs ? (
        <PacksTab viewerId={viewer.id} />
      ) : trending ? (
        <TrendingTab />
      ) : (
        <PostsTab viewer={viewer} sort={sort} media={media} sortHref={href({ sort: sort === "top" ? "latest" : "top", media })} mediaHref={href({ sort, media: !media })} allHref={href({ sort, media: false })} />
      )}
    </>
  )
}

function PostsTab({
  viewer,
  sort,
  media,
  sortHref,
  mediaHref,
  allHref,
}: {
  viewer: Viewer
  sort: "top" | "latest"
  media: boolean
  sortHref: string
  mediaHref: string
  allHref: string
}) {
  const spec: FeedSpec = { kind: "explore", sort, media }
  const page = feedFor(spec, viewer.id)
  const empty = page.items.length === 0 && !page.next
  return (
    <>
      <div className="flex items-center gap-2 px-4 py-3">
        <SearchField defaultQuery="" className="min-w-0 flex-1" />
        <RankingButton href={sortHref} sort={sort} />
        <MediaSwitch href={mediaHref} checked={media} />
      </div>
      <FeedList
        key={`${sort}-${media ? "media" : "all"}`}
        items={page.items}
        next={page.next}
        spec={spec}
        viewer={viewer}
        emptyTitle={media ? "No photos or videos yet" : "Nothing to show yet"}
        emptyBody={media ? "Posts with photos or videos show up here. Turn the switch off to see every post." : "Posts from everyone show up here as people write them."}
        emptyAction={
          empty ? (
            <>
              <ComposeAction>Write a post</ComposeAction>
              {media ? (
                <Link href={allHref} scroll={false} className={emptyActionClass("secondary")}>
                  Show all posts
                </Link>
              ) : null}
            </>
          ) : undefined
        }
      />
    </>
  )
}

// Starter packs: lists of people published by the people who made them. Owners who have blocked the viewer stay hidden.
function PacksTab({ viewerId }: { viewerId: string }) {
  const found = starterPacks(viewerId, PACKS_LIMIT)
  const visible = listOwnersVisibleTo(viewerId, found.map((pack) => pack.owner.id))
  const shown = found.filter((pack) => visible.has(pack.owner.id))
  if (shown.length === 0) {
    return (
      <EmptyState
        title="No starter packs yet"
        body="Make a public list, add people to it, then publish it as a starter pack. It shows up here."
      >
        <Link href="/lists" className={emptyActionClass("secondary")}>
          Your lists
        </Link>
      </EmptyState>
    )
  }
  return (
    <>
      <p className="px-4 pt-4 pb-2 text-[15px] text-muted-foreground">Follow everyone in a pack at once, or open it to see who is in it.</p>
      <PackList packs={shown} />
      <Link href="/packs" className="block px-4 py-4 text-[15px] font-semibold hover:underline">
        All starter packs
      </Link>
    </>
  )
}

function TrendingTab() {
  const tags = trendingTags(TRENDING_LIMIT)
  return (
    <>
      <SearchField defaultQuery="" />
      {tags.length === 0 ? (
        <EmptyState title="Nothing is trending yet" body="Topics are the hashtags people use in posts during the last 7 days. Use one in a post and it starts the list.">
          <ComposeAction>Write a post</ComposeAction>
        </EmptyState>
      ) : (
        <section aria-labelledby="trending-heading">
          <div className="border-t border-border px-4 pt-4 pb-2">
            <h2 id="trending-heading" className="text-lg font-semibold">
              Trending topics
            </h2>
            <p className="text-[13px] text-muted-foreground">The hashtags used in the most posts during the last 7 days.</p>
          </div>
          <ol>
            {tags.map((item, index) => (
              <li key={item.tag} className="border-t border-border first:border-t-0">
                <Link
                  href={`/topics/${encodeURIComponent(item.tag)}`}
                  className="flex min-h-14 items-center gap-3 px-4 py-3 transition-colors duration-200 hover:bg-foreground/5"
                >
                  <span className="w-6 shrink-0 text-right text-[15px] font-semibold text-muted-foreground tabular-nums" aria-hidden="true">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">#{item.tag}</span>
                    <span className="block text-[13px] text-muted-foreground">
                      {formatCount(item.count)} {item.count === 1 ? "post" : "posts"} this week
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  )
}
