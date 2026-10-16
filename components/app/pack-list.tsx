import Link from "next/link"
import type { ListSummary } from "@/lib/data"
import { formatCount } from "@/lib/format"

// Starter packs as rows. Each row opens the pack, where everyone in it can be followed at once.
export function PackList({ packs }: { packs: ListSummary[] }) {
  return (
    <ul className="list-none">
      {packs.map((pack) => (
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
  )
}
