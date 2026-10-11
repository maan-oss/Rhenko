import Link from "next/link"
import { getViewer } from "@/lib/auth"
import { trendingTags, whoToFollow } from "@/lib/data"
import { Avatar } from "@/components/app/avatar"
import { FollowButton } from "@/components/app/follow-button"
import { formatCount } from "@/lib/format"

export async function RightRail() {
  const viewer = await getViewer()
  const tags = trendingTags()
  const suggestions = viewer ? whoToFollow(viewer.id) : []
  return (
    <aside className="sticky top-0 hidden h-dvh w-[340px] shrink-0 flex-col gap-4 overflow-y-auto py-3 pr-3 pl-6 xl:flex">
      <section className="overflow-hidden rounded-[24px] border border-border bg-card">
        <h2 className="px-5 pt-4 pb-2 text-[18px] font-semibold tracking-tight">Trending</h2>
        {tags.length === 0 ? (
          <p className="px-5 pt-1 pb-5 text-sm text-muted-foreground">Hashtags from this week show up here.</p>
        ) : (
          <ul className="pb-1">
            {tags.map((item) => (
              <li key={item.tag}>
                <Link href={`/topics/${item.tag}`} className="block px-5 py-2.5 transition-colors duration-200 hover:bg-foreground/5">
                  <p className="text-[15px] font-semibold">#{item.tag}</p>
                  <p className="text-[13px] text-muted-foreground">
                    {formatCount(item.count)} {item.count === 1 ? "post" : "posts"} this week
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link href="/explore" className="block border-t border-border px-5 py-3 text-sm font-medium transition-colors duration-200 hover:bg-foreground/5">
          Show more
        </Link>
      </section>

      {suggestions.length > 0 ? (
        <section className="overflow-hidden rounded-[24px] border border-border bg-card">
          <h2 className="px-5 pt-4 pb-2 text-[18px] font-semibold tracking-tight">Who to follow</h2>
          <ul className="pb-2">
            {suggestions.map((user) => (
              <li key={user.id} className="flex items-center gap-3 px-5 py-3 transition-colors duration-200 hover:bg-foreground/5">
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
