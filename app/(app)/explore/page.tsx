import { Suspense } from "react"
import { requireViewer } from "@/lib/auth"
import { feedFor, type FeedSpec } from "@/lib/feeds"
import { firstParam } from "@/lib/params"
import { PageHeader } from "@/components/app/page-header"
import { FeedList } from "@/components/app/feed-list"
import { MediaSwitch, RankingButton } from "@/components/app/explore-controls"
import { SearchField } from "@/components/app/search-field"

type SearchParams = Promise<{ sort?: string | string[]; media?: string | string[] }>

export default function ExplorePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={null}>
      <ExploreBody searchParams={searchParams} />
    </Suspense>
  )
}

async function ExploreBody({ searchParams }: { searchParams: SearchParams }) {
  const viewer = await requireViewer()
  const params = await searchParams
  const sort = firstParam(params.sort) === "latest" ? "latest" : "top"
  const media = firstParam(params.media) === "1"
  const spec: FeedSpec = { kind: "explore", sort, media }
  const page = feedFor(spec, viewer.id)

  const href = (next: { sort: "top" | "latest"; media: boolean }) => {
    const query = new URLSearchParams()
    if (next.sort === "latest") query.set("sort", "latest")
    if (next.media) query.set("media", "1")
    const search = query.toString()
    return search ? `/explore?${search}` : "/explore"
  }

  return (
    <>
      <PageHeader title="Explore" />
      <div className="flex items-center gap-2 px-4 py-3">
        <SearchField defaultQuery="" className="min-w-0 flex-1" />
        <RankingButton href={href({ sort: sort === "top" ? "latest" : "top", media })} sort={sort} />
        <MediaSwitch href={href({ sort, media: !media })} checked={media} />
      </div>
      <FeedList
        key={`${sort}-${media ? "media" : "all"}`}
        items={page.items}
        next={page.next}
        spec={spec}
        viewer={viewer}
        emptyTitle={media ? "No photos or videos yet" : "Nothing to show yet"}
        emptyBody={media ? "Posts with photos or videos show up here." : "Posts from everyone show up here as people write them."}
      />
    </>
  )
}
