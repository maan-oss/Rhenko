import { Suspense } from "react"
import Link from "next/link"
import { Sparkles, Users } from "lucide-react"
import { requireViewer } from "@/lib/auth"
import { trendingTags, whoToFollow } from "@/lib/data"
import { feedFor, type FeedSpec } from "@/lib/feeds"
import { firstParam } from "@/lib/params"
import { ComposeAction } from "@/components/app/compose-action"
import { emptyActionClass } from "@/components/app/empty-state"
import { MenuButton } from "@/components/app/menu-button"
import { PageHeader } from "@/components/app/page-header"
import { PeopleList } from "@/components/app/people-list"
import { TabLinks } from "@/components/app/tabs"
import { Composer } from "@/components/app/composer"
import { FeedList } from "@/components/app/feed-list"
import { Skeleton } from "@/components/ui/skeleton"

type SearchParams = Promise<{ tab?: string | string[] }>

const CHIP =
  "glass inline-flex h-10 shrink-0 items-center rounded-full px-3.5 text-[14px] font-semibold transition-colors duration-200 hover:bg-foreground/5 sm:h-9"

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
  const tags = trendingTags(8)
  const empty = page.items.length === 0 && !page.next
  return (
    <>
      <PageHeader
        title="Home"
        hideTitleOnPhone
        lead={<MenuButton />}
        tabs={
          <TabLinks
            items={[
              { href: "/", label: "For you", icon: <Sparkles />, active: !following },
              { href: "/?tab=following", label: "Following", icon: <Users />, active: following },
            ]}
          />
        }
      />
      {tags.length > 0 ? (
        <nav aria-label="Trending topics" className="flex gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tags.map(({ tag }) => (
            <Link key={tag} href={`/topics/${encodeURIComponent(tag)}`} className={`${CHIP} text-foreground`}>
              #{tag}
            </Link>
          ))}
          <Link href="/explore?tab=trending" className={`${CHIP} text-muted-foreground`}>
            All topics
          </Link>
        </nav>
      ) : null}
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
            ? "When people you follow post, their posts show up here."
            : "Write a post, or follow people and their posts will fill this page."
        }
        emptyAction={empty ? following ? <FollowingEmpty viewerId={viewer.id} /> : <ForYouEmpty /> : undefined}
      />
    </>
  )
}

// An empty For you feed: write the first post, or go and find people.
function ForYouEmpty() {
  return (
    <>
      <ComposeAction>Write a post</ComposeAction>
      <Link href="/explore" className={emptyActionClass("secondary")}>
        Explore
      </Link>
    </>
  )
}

// An empty Following feed: a few people worth following right here, because the suggestions rail is not on every screen.
function FollowingEmpty({ viewerId }: { viewerId: string }) {
  const people = whoToFollow(viewerId, 5)
  return (
    <>
      {people.length > 0 ? (
        <div className="w-full max-w-md overflow-hidden rounded-2xl border border-border text-left [&_li:last-child]:border-b-0">
          <p className="px-4 pt-3 pb-1 text-sm font-semibold">Who to follow</p>
          <PeopleList users={people} viewerId={viewerId} removable={false} emptyText="" />
        </div>
      ) : null}
      <Link href="/explore" className={emptyActionClass(people.length > 0 ? "secondary" : "primary")}>
        {people.length > 0 ? "Find more people" : "Explore"}
      </Link>
    </>
  )
}

function FeedSkeleton() {
  return (
    <div className="flex flex-col gap-5 px-4 py-6">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className="size-10 shrink-0 rounded-full" />
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
