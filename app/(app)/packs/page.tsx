import { Suspense } from "react"
import Link from "next/link"
import { requireViewer } from "@/lib/auth"
import { starterPacks } from "@/lib/data"
import { formatCount } from "@/lib/format"
import { listOwnersVisibleTo } from "@/lib/people-state"
import { PageHeader } from "@/components/app/page-header"

export default function PacksPage() {
  return (
    <Suspense fallback={null}>
      <PacksBody />
    </Suspense>
  )
}

async function PacksBody() {
  const viewer = await requireViewer()
  const packs = starterPacks(viewer.id)
  // A pack whose owner has blocked the viewer stays out of sight, as the list itself does.
  const visible = listOwnersVisibleTo(viewer.id, packs.map((pack) => pack.owner.id))
  const shown = packs.filter((pack) => visible.has(pack.owner.id))

  return (
    <>
      <PageHeader title="Starter packs" backHref="/lists" />
      <p className="px-4 pt-4 pb-2 text-[15px] text-muted-foreground">
        Lists of people, published by the people who made them. Follow everyone in one at once, or open it to see who is in it.
      </p>
      {shown.length === 0 ? (
        <p className="px-4 pt-6 pb-16 text-muted-foreground">
          No starter packs yet. Make a public list, add people to it, then publish it as a starter pack.
        </p>
      ) : (
        <ul className="list-none">
          {shown.map((pack) => (
            <li key={pack.id} className="border-b border-border">
              <Link href={`/lists/${pack.id}`} className="flex flex-col gap-1 px-4 py-4 transition-colors hover:bg-muted/50">
                <span className="text-[17px] font-semibold">{pack.name}</span>
                {pack.description ? <span className="text-[15px] text-muted-foreground">{pack.description}</span> : null}
                <span className="text-sm text-muted-foreground">
                  {formatCount(pack.memberCount)} {pack.memberCount === 1 ? "person" : "people"} · by @{pack.owner.handle}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
