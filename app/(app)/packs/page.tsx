import { requireViewer } from "@/lib/auth"
import { starterPacks } from "@/lib/data"
import { listOwnersVisibleTo } from "@/lib/people-state"
import { PackList } from "@/components/app/pack-list"
import { PageHeader } from "@/components/app/page-header"
import { RevealSuspense } from "@/components/app/reveal-suspense"

export default function PacksPage() {
  return (
    <RevealSuspense>
      <PacksBody />
    </RevealSuspense>
  )
}

async function PacksBody() {
  const viewer = await requireViewer()
  const packs = await starterPacks(viewer.id)
  // A pack whose owner has blocked the viewer stays out of sight, as the list itself does.
  const visible = await listOwnersVisibleTo(viewer.id, packs.map((pack) => pack.owner.id))
  const shown = packs.filter((pack) => visible.has(pack.owner.id))

  return (
    <>
      <PageHeader title="Starter packs" backHref="/lists" />
      <p className="px-4 pt-4 pb-2 text-[15px] text-muted-foreground">
        Lists of people, published by the people who made them. Follow everyone in one at once, or open it to see who is in it.
      </p>
      {shown.length === 0 ? (
        <p className="px-4 pt-4 pb-6 text-muted-foreground">
          No starter packs yet. Make a public list, add people to it, then publish it as a starter pack.
        </p>
      ) : (
        <PackList packs={shown} />
      )}
    </>
  )
}
