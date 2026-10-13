import { Suspense } from "react"
import Link from "next/link"
import { Sparkles, Users } from "lucide-react"
import { connection } from "next/server"
import { requireViewer } from "@/lib/auth"
import { circlesFor } from "@/lib/circles"
import { suggestionsFor, topPeople } from "@/lib/connections"
import { whoToFollow } from "@/lib/data"
import { feedFor, type FeedSpec } from "@/lib/feeds"
import { firstParam } from "@/lib/params"
import { Avatar } from "@/components/app/avatar"
import { ComposeAction } from "@/components/app/compose-action"
import { emptyActionClass } from "@/components/app/empty-state"
import { MenuButton } from "@/components/app/menu-button"
import { PageHeader } from "@/components/app/page-header"
import { PeopleList } from "@/components/app/people-list"
import { TabLinks } from "@/components/app/tabs"
import { Composer } from "@/components/app/composer"
import { FeedList } from "@/components/app/feed-list"
import { FeedSkeleton } from "@/components/app/feed-skeleton"
import { FollowButton } from "@/components/app/follow-button"
import { SetupBanner } from "@/components/app/setup-banner"

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
      {viewer.onboarding === "pending" ? <SetupBanner /> : null}
      <Composer
        viewer={viewer}
        placeholder="What's happening?"
        id="compose"
        circles={circlesFor(viewer.id).map((circle) => ({ id: circle.id, name: circle.name }))}
      />
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
        emptyAction={empty ? following ? <FollowingEmpty viewerId={viewer.id} /> : <ForYouEmpty viewerId={viewer.id} /> : undefined}
      />
    </>
  )
}

// The time the page is read. Read after connection(), so the page is never built with a fixed clock.
async function clock(): Promise<number> {
  await connection()
  return Date.now()
}

// An empty For you feed: a few people to start with, then write the first post or go and find people.
async function ForYouEmpty({ viewerId }: { viewerId: string }) {
  const people = topPeople(suggestionsFor(viewerId, await clock(), 4), 4)
  return (
    <>
      {people.length > 0 ? (
        <div className="w-full max-w-md overflow-hidden rounded-2xl border border-border text-left">
          <p className="px-4 pt-3 pb-1 text-sm font-semibold">Follow a few people to start</p>
          <ul>
            {people.map((person) => (
              <li key={person.id} className="flex items-center gap-3 border-t border-border px-4 py-3">
                <Link href={`/${person.handle}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar user={{ id: person.id, name: person.name, avatarFile: person.avatarFile }} size={40} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{person.name}</span>
                    <span className="block truncate text-[13px] text-muted-foreground">{person.reasons[0] ?? `@${person.handle}`}</span>
                  </span>
                </Link>
                <FollowButton handle={person.handle} state="none" />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
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

