"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { setPriorityAccount } from "@/actions/notifications"
import { Avatar } from "@/components/app/avatar"
import { VerifiedBadge } from "@/components/app/badges"
import { cn } from "@/lib/utils"

export type PriorityRow = { id: string; handle: string; name: string; avatarFile: string | null; verified: boolean; priority: boolean }

// The accounts the viewer follows, each with a switch that adds it to the Priority tab. Up to `limit` can be on.
export function PriorityAccounts({ initial, limit }: { initial: PriorityRow[]; limit: number }) {
  const [rows, setRows] = useState(initial)
  const [pending, startTransition] = useTransition()
  const chosen = rows.filter((row) => row.priority).length

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Follow someone, and you can add them here.</p>
  }

  function toggle(row: PriorityRow) {
    const next = !row.priority
    if (next && chosen >= limit) {
      toast.error(`Priority holds up to ${limit} accounts. Remove one to add another.`)
      return
    }
    setRows((current) => current.map((item) => (item.id === row.id ? { ...item, priority: next } : item)))
    startTransition(async () => {
      const result = await setPriorityAccount(row.id, next)
      if (!result.ok) {
        setRows((current) => current.map((item) => (item.id === row.id ? { ...item, priority: !next } : item)))
        toast.error(result.error)
      }
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm tabular-nums text-muted-foreground">
        {chosen} of {limit} chosen
      </p>
      <ul className="list-none divide-y divide-border overflow-hidden rounded-lg border border-border">
        {rows.map((row) => (
          <li key={row.id}>
            <button
              type="button"
              role="switch"
              aria-checked={row.priority}
              aria-label={`Priority notifications from ${row.name}`}
              disabled={pending}
              onClick={() => toggle(row)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted disabled:opacity-60"
            >
              <Avatar user={row} size={36} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex min-w-0 items-center gap-1 text-[15px] font-semibold">
                  <span className="truncate">{row.name}</span>
                  {row.verified ? <VerifiedBadge className="shrink-0" /> : null}
                </span>
                <span className="truncate text-sm text-muted-foreground">@{row.handle}</span>
              </span>
              <span aria-hidden className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", row.priority ? "bg-dusk" : "bg-muted-foreground/40")}>
                <span className={cn("absolute top-0.5 left-0.5 size-5 rounded-full bg-background shadow transition-transform", row.priority && "translate-x-5")} />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
