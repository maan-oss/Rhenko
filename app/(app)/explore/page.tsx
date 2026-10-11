import { Suspense } from "react"
import Link from "next/link"
import { requireViewer } from "@/lib/auth"
import { searchPostFeed, searchUsers, trendingTags, whoToFollow } from "@/lib/data"
import { extractHashtags } from "@/lib/rules"
import { firstParam } from "@/lib/params"
import { formatCount } from "@/lib/format"
import { Avatar } from "@/components/app/avatar"
import { FeedList, MoreLink } from "@/components/app/feed-list"
import { FollowButton } from "@/components/app/follow-button"
import { PageHeader } from "@/components/app/page-header"
import { TabLinks } from "@/components/app/tabs"

type SearchParams = Promise<{ q?: string | string[]; tab?: string | string[]; before?: string | string[] }>

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
  const q = (firstParam(params.q) ?? "").trim().slice(0, 100)
  const tab = firstParam(params.tab) === "people" ? "people" : "posts"
  const before = firstParam(params.before)
  const searching = q.length > 0
  const encoded = encodeURIComponent(q)

  if (!searching) {
    const tags = trendingTags(10)
    const suggestions = whoToFollow(viewer.id, 10)
    return (
      <>
        <PageHeader title="Explore" />
        <form action="/explore" role="search" className="px-4 py-3">
          <label htmlFor="explore-search" className="sr-only">Search Rhenko</label>
          <input
            id="explore-search"
            name="q"
            type="search"
            placeholder="Search posts and people"
            className="h-11 w-full rounded-[4px] border border-input bg-background px-4 text-[15px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </form>
        <section className="border-b border-border">
          <h2 className="px-4 pt-2 pb-1 text-lg font-semibold">Trending this week</h2>
          {tags.length === 0 ? (
            <p className="px-4 pb-4 text-muted-foreground">Hashtags show up here once people start using them.</p>
          ) : (
            <ul>
              {tags.map((item) => (
                <li key={item.tag}>
                  <Link href={`/explore?q=${encodeURIComponent(`#${item.tag}`)}`} className="block px-4 py-3 hover:bg-muted/50">
                    <p className="font-semibold">#{item.tag}</p>
                    <p className="text-sm text-muted-foreground">{formatCount(item.count)} {item.count === 1 ? "post" : "posts"}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h2 className="px-4 pt-4 pb-1 text-lg font-semibold">Who to follow</h2>
          {suggestions.length === 0 ? (
            <p className="px-4 pb-6 text-muted-foreground">You are following everyone here for now.</p>
          ) : (
            <ul>
              {suggestions.map((user) => (
                <li key={user.id} className="flex items-center gap-3 px-4 py-3">
                  <Link href={`/${user.handle}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <Avatar user={user} size={40} />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{user.name}</span>
                      <span className="block truncate text-sm text-muted-foreground">@{user.handle}</span>
                      <span className="block truncate text-sm text-muted-foreground">{user.bio}</span>
                    </span>
                  </Link>
                  <FollowButton handle={user.handle} following={user.following} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </>
    )
  }

  const tagQuery = q.startsWith("#") ? q.slice(1).toLowerCase() : null
  const posts = tab === "posts" ? searchPostFeed(q, viewer.id, before) : null
  const filteredItems = posts
    ? tagQuery
      ? posts.items.filter((item) => extractHashtags(item.post.body).includes(tagQuery))
      : posts.items
    : []
  const people = tab === "people" ? searchUsers(q, viewer.id) : []

  return (
    <>
      <PageHeader title={q} backHref="/explore">
        <TabLinks
          items={[
            { href: `/explore?q=${encoded}`, label: "Posts", active: tab === "posts" },
            { href: `/explore?q=${encoded}&tab=people`, label: "People", active: tab === "people" },
          ]}
        />
      </PageHeader>
      {tab === "posts" ? (
        <>
          <FeedList
            items={filteredItems}
            viewer={viewer}
            emptyTitle={`No posts for "${q}"`}
            emptyBody="Try another word, or check the spelling."
          />
          <MoreLink href={posts?.next ? `/explore?q=${encoded}&before=${encodeURIComponent(posts.next)}` : null} />
        </>
      ) : people.length === 0 ? (
        <div className="px-4 py-16">
          <p className="text-lg font-semibold">No people match &quot;{q}&quot;</p>
          <p className="text-muted-foreground">Search by name or @handle.</p>
        </div>
      ) : (
        <ul>
          {people.map((user) => (
            <li key={user.id} className="flex items-center gap-3 border-b border-border px-4 py-3">
              <Link href={`/${user.handle}`} className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar user={user} size={44} />
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{user.name}</span>
                  <span className="block truncate text-sm text-muted-foreground">@{user.handle}</span>
                  {user.bio ? <span className="block truncate text-sm">{user.bio}</span> : null}
                </span>
              </Link>
              <FollowButton handle={user.handle} following={user.following} />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
