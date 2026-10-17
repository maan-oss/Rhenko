import Link from "next/link"
import { connection } from "next/server"
import { getViewer } from "@/lib/auth"
import { trendingTags, whoToFollow } from "@/lib/data"
import { suggestionsFor, topPeople } from "@/lib/connections"
import { Avatar } from "@/components/app/avatar"
import { FollowButton } from "@/components/app/follow-button"
import { formatCount } from "@/lib/format"

// The side panel is two panels, not a feed of suggestions. "What's moving" ranks topics by how many posts they had this
// week, and each row carries a bar drawn against the busiest topic, so the eye can compare them at a glance. "People to
// meet" is a strip of cards the reader can scroll sideways. It suggests people from Connect when there are any, and falls
// back to the most followed accounts when there are none, so an account with nothing filled in still sees people.

// The time the panel is read. Read after connection(), so the page is never built with a fixed clock.
async function clock(): Promise<number> {
  await connection()
  return Date.now()
}

type Person = { id: string; handle: string; name: string; avatarFile: string | null; detail: string; following: boolean }

function PersonCard({ person }: { person: Person }) {
  return (
    <li className="flex w-[152px] shrink-0 snap-start flex-col gap-3 rounded-2xl border border-border bg-background p-3.5">
      <Link href={`/${person.handle}`} className="flex min-w-0 flex-col gap-2 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Avatar user={{ id: person.id, name: person.name, avatarFile: person.avatarFile }} size={48} />
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-semibold">{person.name}</span>
          <span className="block truncate text-[12px] text-muted-foreground">{person.detail}</span>
        </span>
      </Link>
      <FollowButton handle={person.handle} state={person.following ? "following" : "none"} />
    </li>
  )
}

export async function RightRail() {
  const viewer = await getViewer()
  const tags = await trendingTags()
  const connected = viewer ? topPeople(await suggestionsFor(viewer.id, await clock(), 4), 4) : []
  const fallback = connected.length === 0 && viewer ? await whoToFollow(viewer.id) : []
  const people: Person[] =
    connected.length > 0
      ? connected.map((person) => ({
          id: person.id,
          handle: person.handle,
          name: person.name,
          avatarFile: person.avatarFile,
          detail: person.reasons[0] ?? `@${person.handle}`,
          following: false,
        }))
      : fallback.map((user) => ({
          id: user.id,
          handle: user.handle,
          name: user.name,
          avatarFile: user.avatarFile,
          detail: `@${user.handle}`,
          following: Boolean(user.following),
        }))
  const busiest = Math.max(1, ...tags.map((item) => item.count))

  return (
    <aside className="sticky top-0 hidden h-dvh w-[340px] shrink-0 flex-col gap-3 overflow-y-auto py-3 pr-3 pl-6 xl:flex">
      <section className="rounded-[24px] border border-border bg-card px-5 pt-4 pb-3">
        <h2 className="text-[18px] font-semibold tracking-tight">What&rsquo;s moving</h2>
        {tags.length === 0 ? (
          <p className="pt-2 pb-2 text-sm text-muted-foreground">Nothing is moving yet. Put a #hashtag in a post and it shows here.</p>
        ) : (
          <ol className="mt-2 flex flex-col">
            {tags.map((item) => (
              <li key={item.tag}>
                <Link href={`/topics/${encodeURIComponent(item.tag)}`} className="group block rounded-xl py-2.5 outline-none transition-colors duration-200 hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[15px] font-semibold">#{item.tag}</span>
                    <span className="shrink-0 text-[13px] text-muted-foreground tabular-nums">{formatCount(item.count)}</span>
                  </span>
                  <span className="mt-2 block h-1 overflow-hidden rounded-full bg-foreground/10" aria-hidden="true">
                    <span
                      className="block h-full rounded-full bg-foreground transition-[width] duration-500 ease-out"
                      style={{ width: `${Math.max(6, Math.round((item.count / busiest) * 100))}%` }}
                    />
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
        {tags.length > 0 ? (
          <Link href="/explore?tab=trending" className="mt-1 inline-block pb-1 text-sm font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline">
            All topics
          </Link>
        ) : null}
      </section>

      {people.length > 0 ? (
        <section className="rounded-[24px] border border-border bg-card px-5 pt-4 pb-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[18px] font-semibold tracking-tight">People to meet</h2>
            <Link href="/connect" className="text-sm font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline">
              More
            </Link>
          </div>
          <ul className="-mx-5 mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {people.map((person) => (
              <PersonCard key={person.id} person={person} />
            ))}
          </ul>
        </section>
      ) : null}
    </aside>
  )
}
