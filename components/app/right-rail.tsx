import Link from "@/components/app/link"
import { connection } from "next/server"
import { getViewer } from "@/lib/auth"
import { trendingTags, whoToFollow } from "@/lib/data"
import { suggestionsFor, topPeople } from "@/lib/connections"
import { topicLabel } from "@/lib/rules"
import { Avatar } from "@/components/app/avatar"
import { ProfileLink } from "@/components/app/profile-hover"
import { cn } from "@/lib/utils"

// The side panel is a short list, the way trending is on X: each hashtag or cashtag sits on one line with its post count.
// People are a stack of faces, each covering a quarter of the one before it, so the row takes little room. Pointing at a
// face opens its card. Nothing here is a button, so the panel reads as something to look at, not something to act on.

// The time the panel is read. Read after connection(), so the page is never built with a fixed clock.
async function clock(): Promise<number> {
  await connection()
  return Date.now()
}

type Person = { id: string; handle: string; name: string; avatarFile: string | null }

// How many topics the panel lists.
const TRENDING_LIMIT = 5

function postCount(count: number): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? "post" : "posts"}`
}

export async function RightRail() {
  const viewer = await getViewer()
  const tags = await trendingTags(TRENDING_LIMIT)
  const connected = viewer ? topPeople(await suggestionsFor(viewer.id, await clock(), 4), 4) : []
  const fallback = connected.length === 0 && viewer ? await whoToFollow(viewer.id) : []
  const people: Person[] =
    connected.length > 0
      ? connected.map((person) => ({ id: person.id, handle: person.handle, name: person.name, avatarFile: person.avatarFile }))
      : fallback.slice(0, 4).map((user) => ({ id: user.id, handle: user.handle, name: user.name, avatarFile: user.avatarFile }))

  return (
    <aside data-right-rail className="sticky top-0 hidden h-dvh w-[340px] shrink-0 flex-col gap-4 overflow-y-auto py-4 pr-4 pl-8 xl:flex">
      <section aria-labelledby="trending-title" className="raised rounded-2xl p-4">
        <h2 id="trending-title" className="text-[18px] font-semibold tracking-tight">
          Trending
        </h2>
        {tags.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Nothing yet. Put a #hashtag or a $cashtag in a post and it lands here.</p>
        ) : (
          <>
            <ul className="mt-2">
              {tags.map((item) => (
                <li key={item.tag} className="border-b border-border/60 last:border-b-0">
                  <Link
                    href={`/topics/${encodeURIComponent(item.tag)}`}
                    aria-label={`${topicLabel(item.tag)}, ${postCount(item.count)} this week`}
                    className="flex items-baseline justify-between gap-3 rounded-md py-2.5 outline-none transition-opacity duration-200 hover:opacity-70 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="min-w-0 truncate font-semibold">{topicLabel(item.tag)}</span>
                    <span className="shrink-0 text-[13px] text-muted-foreground tabular-nums">{postCount(item.count)}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <Link href="/explore?tab=trending" className="mt-3 inline-block text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline">
              Explore topics
            </Link>
          </>
        )}
      </section>

      {people.length > 0 ? (
        <section aria-labelledby="meet-title" className="raised rounded-2xl p-4">
          <h2 id="meet-title" className="text-[18px] font-semibold tracking-tight">
            People to meet
          </h2>
          {/* Stacked, each face covers a quarter of the one before. Resting on the row spreads them apart, so every face shows
              whole. Every face keeps the same size, hovered or not. */}
          <div className="group mt-4 flex items-center pl-1">
            {people.map((person, index) => (
              <ProfileLink
                key={person.id}
                handle={person.handle}
                label={person.name}
                className={cn(
                  "relative rounded-full outline-none transition-[margin] duration-200 focus-visible:ring-2 focus-visible:ring-ring",
                  index > 0 && "-ml-[11px] group-hover:ml-1"
                )}
              >
                <Avatar user={{ id: person.id, name: person.name, avatarFile: person.avatarFile }} size={44} className="ring-2 ring-background" />
              </ProfileLink>
            ))}
          </div>
          <Link href="/connect" className="mt-4 inline-block text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline">
            Find more people
          </Link>
        </section>
      ) : null}
    </aside>
  )
}
