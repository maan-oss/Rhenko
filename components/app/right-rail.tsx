import Link from "next/link"
import { connection } from "next/server"
import { getViewer } from "@/lib/auth"
import { trendingTags, whoToFollow } from "@/lib/data"
import { suggestionsFor, topPeople } from "@/lib/connections"
import { Avatar } from "@/components/app/avatar"
import { FollowButton } from "@/components/app/follow-button"
import { formatCount } from "@/lib/format"

// The side panel suggests people from Connect when there are any, and falls back to the most followed accounts when there
// are none, so an account with nothing filled in still sees people.
// The time the panel is read. Read after connection(), so the page is never built with a fixed clock.
async function clock(): Promise<number> {
  await connection()
  return Date.now()
}

export async function RightRail() {
  const viewer = await getViewer()
  const tags = await trendingTags()
  const connected = viewer ? topPeople(await suggestionsFor(viewer.id, await clock(), 3), 3) : []
  const suggestions = connected.length === 0 && viewer ? await whoToFollow(viewer.id) : []
  return (
    <aside className="sticky top-0 hidden h-dvh w-[340px] shrink-0 flex-col gap-4 overflow-y-auto py-3 pr-3 pl-6 xl:flex">
      <section className="overflow-hidden rounded-[24px] border border-border bg-card">
        <h2 className="px-5 pt-4 pb-2 text-[18px] font-semibold tracking-tight">Trending</h2>
        {tags.length === 0 ? (
          <p className="px-5 pt-1 pb-5 text-sm text-muted-foreground">Nothing is trending yet. Put a #hashtag in a post and it shows up here.</p>
        ) : (
          <>
            <ul className="pb-1">
              {tags.map((item) => (
                <li key={item.tag}>
                  <Link href={`/topics/${encodeURIComponent(item.tag)}`} className="block px-5 py-2.5 transition-colors duration-200 hover:bg-foreground/5">
                    <p className="text-[15px] font-semibold">#{item.tag}</p>
                    <p className="text-[13px] text-muted-foreground">
                      {formatCount(item.count)} {item.count === 1 ? "post" : "posts"} this week
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
            <Link href="/explore?tab=trending" className="block border-t border-border px-5 py-3 text-sm font-medium transition-colors duration-200 hover:bg-foreground/5">
              Show more
            </Link>
          </>
        )}
      </section>

      {connected.length > 0 ? (
        <section className="overflow-hidden rounded-[24px] border border-border bg-card">
          <h2 className="px-5 pt-4 pb-2 text-[18px] font-semibold tracking-tight">Who to follow</h2>
          <ul className="pb-2">
            {connected.map((person) => (
              <li key={person.id} className="flex items-center gap-3 px-5 py-3 transition-colors duration-200 hover:bg-foreground/5">
                <Link href={`/${person.handle}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar user={{ id: person.id, name: person.name, avatarFile: person.avatarFile }} size={40} />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{person.name}</span>
                    <span className="block truncate text-sm text-muted-foreground">{person.reasons[0] ?? `@${person.handle}`}</span>
                  </span>
                </Link>
                <FollowButton handle={person.handle} state="none" />
              </li>
            ))}
          </ul>
          <Link href="/connect" className="block border-t border-border px-5 py-3 text-sm font-medium transition-colors duration-200 hover:bg-foreground/5">
            Show more
          </Link>
        </section>
      ) : null}
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
