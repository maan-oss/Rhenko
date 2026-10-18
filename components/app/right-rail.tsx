import Link from "next/link"
import { connection } from "next/server"
import { getViewer } from "@/lib/auth"
import { trendingTags, whoToFollow } from "@/lib/data"
import { suggestionsFor, topPeople } from "@/lib/connections"
import { Avatar } from "@/components/app/avatar"

// The side panel is set as type, not as boxes. Topics are words, and each word is sized by how many posts it had this
// week, so the busiest one reads first without a list or a bar. People are a small pile of faces with their names in a
// sentence and one link on. Nothing here has a button, so the panel reads as something to look at, not something to act on.

// The time the panel is read. Read after connection(), so the page is never built with a fixed clock.
async function clock(): Promise<number> {
  await connection()
  return Date.now()
}

type Person = { id: string; handle: string; name: string; avatarFile: string | null }

// Words run from 13px to 22px. The range is narrow on purpose: the busiest word leads without pushing the others onto lines
// of their own, so the set reads as a cloud rather than a column.
function wordSize(count: number, busiest: number): string {
  return `${Math.round(13 + 9 * (count / busiest))}px`
}

export async function RightRail() {
  const viewer = await getViewer()
  const tags = await trendingTags()
  const connected = viewer ? topPeople(await suggestionsFor(viewer.id, await clock(), 4), 4) : []
  const fallback = connected.length === 0 && viewer ? await whoToFollow(viewer.id) : []
  const people: Person[] =
    connected.length > 0
      ? connected.map((person) => ({ id: person.id, handle: person.handle, name: person.name, avatarFile: person.avatarFile }))
      : fallback.slice(0, 4).map((user) => ({ id: user.id, handle: user.handle, name: user.name, avatarFile: user.avatarFile }))
  const busiest = Math.max(1, ...tags.map((item) => item.count))
  const names = people.map((person) => person.name)
  const namesLine = names.length <= 2 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`

  return (
    <aside className="sticky top-0 hidden h-dvh w-[340px] shrink-0 flex-col gap-4 overflow-y-auto py-4 pr-4 pl-8 xl:flex">
      <section aria-labelledby="moving-title">
        <h2 id="moving-title" className="text-[18px] font-semibold tracking-tight">
          Moving now
        </h2>
        {tags.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Nothing yet. Put a #hashtag in a post and it lands here.</p>
        ) : (
          <>
            <ul className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
              {tags.map((item) => (
                <li key={item.tag}>
                  <Link
                    href={`/topics/${encodeURIComponent(item.tag)}`}
                    aria-label={`#${item.tag}, ${item.count} ${item.count === 1 ? "post" : "posts"} this week`}
                    style={{ fontSize: wordSize(item.count, busiest) }}
                    className="rounded-md leading-tight font-semibold tracking-tight outline-none transition-opacity duration-200 hover:opacity-60 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    #{item.tag}
                  </Link>
                </li>
              ))}
            </ul>
            <Link href="/explore?tab=trending" className="mt-5 inline-block text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline">
              Explore topics
            </Link>
          </>
        )}
      </section>

      {people.length > 0 ? (
        <section aria-labelledby="meet-title" className="border-t border-border pt-5">
          <h2 id="meet-title" className="text-[18px] font-semibold tracking-tight">
            Writers to meet
          </h2>
          <div className="mt-4 flex gap-2.5">
            {people.map((person) => (
              <Link
                key={person.id}
                href={`/${person.handle}`}
                className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Avatar user={{ id: person.id, name: person.name, avatarFile: person.avatarFile }} size={44} />
              </Link>
            ))}
          </div>
          <p className="mt-3 text-[15px] leading-relaxed">{namesLine}</p>
          <Link href="/connect" className="mt-3 inline-block text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline">
            Find more people
          </Link>
        </section>
      ) : null}
    </aside>
  )
}
