import { Suspense } from "react"
import { requireViewer } from "@/lib/auth"
import { feedFor, type FeedSpec } from "@/lib/feeds"
import { firstParam } from "@/lib/params"
import { PageHeader } from "@/components/app/page-header"
import { TabLinks } from "@/components/app/tabs"
import { Composer } from "@/components/app/composer"
import { FeedList } from "@/components/app/feed-list"
import { Skeleton } from "@/components/ui/skeleton"

type SearchParams = Promise<{ tab?: string | string[] }>

export default function HomePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<FeedSkeleton />}>
      <Home searchParams={searchParams} />
    </Suspense>
  )
}

async function Home({ searchParams }: { searchParams: SearchParams }) {
  const viewer = await requireViewer()
  const params = await searchParams
  const mode = firstParam(params.tab) === "following" ? "following" : "for-you"
  const spec: FeedSpec = { kind: "home", mode }
  const page = feedFor(spec, viewer.id)
  const following = mode === "following"
  return (
    <>
      <PageHeader title="Home">
        <TabLinks
          items={[
            { href: "/", label: "For you", active: !following },
            { href: "/?tab=following", label: "Following", active: following },
          ]}
        />
      </PageHeader>
      <Composer viewer={viewer} placeholder="What's happening?" id="compose" />
      <FeedList
        key={mode}
        items={page.items}
        next={page.next}
        spec={spec}
        viewer={viewer}
        emptyTitle={following ? "Nothing from people you follow yet" : "No posts yet"}
        emptyBody={
          following
            ? "Follow people from Explore or the suggestions on the right."
            : "Write the first post, or follow people to fill this page."
        }
      />
    </>
  )
}

function FeedSkeleton() {
  return (
    <div className="flex flex-col gap-5 px-4 py-6">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className="size-10 shrink-0 rounded-none" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  )
}
