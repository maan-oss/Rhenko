import Link from "@/components/app/link"
import { Lock } from "lucide-react"
import type { Circle } from "@/lib/circles"
import type { CircleAccess } from "@/lib/rules"
import { formatCount } from "@/lib/format"

// The words a circle's access setting is known by, everywhere it is shown.
export const ACCESS_LABEL: Record<CircleAccess, string> = {
  open: "Open to anyone",
  request: "Ask to join",
  closed: "Invite only",
}

// One circle in a list: its name, tagline, size and how to get in.
export function CircleRow({ circle }: { circle: Circle }) {
  return (
    <li className="border-b border-border">
      <Link href={`/circles/${circle.slug}`} className="flex flex-col gap-1 px-4 py-4 transition-colors hover:bg-muted/50">
        <span className="flex items-center gap-2 text-[17px] font-semibold">
          <span className="truncate">{circle.name}</span>
          {circle.access === "closed" ? (
            <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-label="Invite only" />
          ) : null}
        </span>
        {circle.tagline ? <span className="text-[15px] text-muted-foreground">{circle.tagline}</span> : null}
        <span className="text-sm text-muted-foreground">
          {formatCount(circle.memberCount)} {circle.memberCount === 1 ? "member" : "members"} · {ACCESS_LABEL[circle.access]}
        </span>
      </Link>
    </li>
  )
}
