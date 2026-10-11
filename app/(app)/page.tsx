import { Suspense } from "react"
import { requireViewer } from "@/lib/auth"
import { homeFeed } from "@/lib/data"
import { firstParam } from "@/lib/params"
import { PageHeader } from "@/components/app/page-header"
import { TabLinks } from "@/components/app/tabs"
import { Composer } from "@/components/app/composer"
import { FeedList, MoreLink } from "@/components/app/feed-list"
import { Skeleton } from "@/components/ui/skeleton"

type SearchParams = Promise<{ tab?: string | string[]; before?: string | string[] }>

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
  const page = homeFeed(mode, viewer.id, firstParam(params.before))
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
      <Composer viewer={viewer} placeholder="Write a post" id="compose" />
      <FeedList
        items={page.items}
        viewer={viewer}
        emptyTitle={following ? "Nothing from people you follow yet" : "No posts yet"}
        emptyBody={
          following
            ? "Follow people from Explore or the suggestions on the right."
            : "Write the first post, or follow people to fill this page."
        }
      />
      <MoreLink href={page.next ? `/?tab=${mode}&before=${encodeURIComponent(page.next)}` : null} />
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
