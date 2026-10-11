import Link from "next/link"
import { getViewer } from "@/lib/auth"
import { trendingTags, whoToFollow } from "@/lib/data"
import { Avatar } from "@/components/app/avatar"
import { FollowButton } from "@/components/app/follow-button"
import { SearchField } from "@/components/app/search-field"
import { formatCount } from "@/lib/format"

export async function RightRail() {
  const viewer = await getViewer()
  const tags = trendingTags()
  const suggestions = viewer ? whoToFollow(viewer.id) : []
  return (
    <aside className="sticky top-0 hidden h-dvh w-[340px] shrink-0 flex-col gap-5 overflow-y-auto py-4 pl-6 xl:flex">
      <SearchField defaultQuery="" />

      <section className="overflow-hidden rounded-2xl bg-muted/50">
        <div className="flex items-center justify-between px-4 pt-3.5 pb-1">
          <h2 className="text-[19px] font-bold tracking-tight">Trending</h2>
        </div>
        {tags.length === 0 ? (
          <p className="px-4 pt-1 pb-4 text-sm text-muted-foreground">Hashtags from this week show up here.</p>
        ) : (
          <ul className="pb-2">
            {tags.map((item) => (
              <li key={item.tag}>
                <Link href={`/topics/${item.tag}`} className="block px-4 py-2.5 transition-colors hover:bg-muted">
                  <p className="text-[15px] font-semibold">#{item.tag}</p>
                  <p className="text-[13px] text-muted-foreground">
                    {formatCount(item.count)} {item.count === 1 ? "post" : "posts"} this week
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link href="/explore" className="block px-4 py-3 text-sm text-dusk transition-colors hover:bg-muted">
          Show more
        </Link>
      </section>

      {suggestions.length > 0 ? (
        <section className="overflow-hidden rounded-2xl bg-muted/50">
          <h2 className="px-4 pt-3.5 pb-1 text-[19px] font-bold tracking-tight">Who to follow</h2>
          <ul className="pb-2">
            {suggestions.map((user) => (
              <li key={user.id} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted">
                <Link href={`/${user.handle}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar user={user} size={40} />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{user.name}</span>
                    <span className="block truncate text-sm text-muted-foreground">@{user.handle}</span>
                  </span>
                </Link>
                <FollowButton handle={user.handle} state={user.following ? "following" : "none"} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </aside>
  )
}
