import Link from "@/components/app/link"
import { ChevronRight, Lock } from "lucide-react"
import { requireViewer } from "@/lib/auth"
import { listsFor, type ListSummary } from "@/lib/data"
import { formatCount } from "@/lib/format"
import { listOwnersVisibleTo } from "@/lib/people-state"
import { ListsHeader } from "@/components/app/lists-header"
import { RevealSuspense } from "@/components/app/reveal-suspense"

export default function ListsPage() {
  return (
    <RevealSuspense>
      <ListsBody />
    </RevealSuspense>
  )
}

async function ListsBody() {
  const viewer = await requireViewer()
  const { owned, followed } = await listsFor(viewer.id)
  // A followed list stays out of sight when its owner's account is gone or the owner has blocked the viewer.
  const visible = await listOwnersVisibleTo(viewer.id, followed.map((list) => list.owner.id))
  return (
    <>
      <ListsHeader />
      {/* A full-width row like the pack rows under it, so its text lines up with the section headings below. */}
      <Link
        href="/packs"
        className="mt-3 flex items-center justify-between gap-4 border-y border-border px-4 py-4 transition-colors hover:bg-muted/50"
      >
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="font-semibold">Starter packs</span>
          <span className="text-sm text-muted-foreground">Lists of people, published by the people who made them. Follow everyone in one at once.</span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
      <Section title="Your lists" lists={owned} empty="You haven't made a list yet. Use New list at the top to make one, then add people to it." />
      <Section
        title="Lists you follow"
        lists={followed.filter((list) => visible.has(list.owner.id))}
        empty="When you follow someone's public list, it shows up here."
      />
    </>
  )
}

function Section({ title, lists, empty }: { title: string; lists: ListSummary[]; empty: string }) {
  return (
    <section>
      <h2 className="px-4 pt-5 pb-2 text-lg font-semibold">{title}</h2>
      {lists.length === 0 ? (
        <p className="px-4 pb-6 text-muted-foreground">{empty}</p>
      ) : (
        <ul className="list-none">
          {lists.map((list) => (
            <li key={list.id} className="border-b border-border">
              <Link href={`/lists/${list.id}`} className="flex flex-col gap-1 px-4 py-4 transition-colors hover:bg-muted/50">
                <span className="flex items-center gap-2 text-[17px] font-semibold">
                  {list.name}
                  {list.private ? <Lock className="size-3.5 text-muted-foreground" aria-label="Private" /> : null}
                </span>
                {list.description ? <span className="text-[15px] text-muted-foreground">{list.description}</span> : null}
                <span className="text-sm text-muted-foreground">
                  {formatCount(list.memberCount)} {list.memberCount === 1 ? "member" : "members"} · by @{list.owner.handle}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
