"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { unsnoozeForYouTopic } from "@/actions/topic-snoozes"
import { topicLabel } from "@/lib/rules"
import { LocalTime } from "@/components/app/time-text"

// The snoozed topics, each with a button to bring its posts back. A row leaves the list once it is unsnoozed.
export function SnoozedTopics({ rows }: { rows: { tag: string; untilAt: number }[] }) {
  const [list, setList] = useState(rows)
  const [pending, start] = useTransition()

  if (list.length === 0) {
    return <p className="border-t border-border py-4 text-sm text-muted-foreground">No topics are snoozed.</p>
  }

  return (
    <ul className="flex flex-col border-t border-border">
      {list.map((row) => (
        <li key={row.tag} className="flex items-center justify-between gap-3 border-b border-border py-3.5">
          <div className="min-w-0">
            <p className="truncate font-semibold">{topicLabel(row.tag)}</p>
            <p className="text-[13px] text-muted-foreground">
              Snoozed until <LocalTime at={row.untilAt} variant="day" />
            </p>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const result = await unsnoozeForYouTopic(row.tag)
                if (result.ok) setList((current) => current.filter((item) => item.tag !== row.tag))
                else toast.error(result.error)
              })
            }
            className="inline-flex h-9 shrink-0 items-center rounded-full border border-border px-3.5 text-sm font-semibold transition-[background-color,transform] duration-200 hover:bg-foreground/5 active:bg-foreground/10 disabled:opacity-50"
          >
            Unsnooze
          </button>
        </li>
      ))}
    </ul>
  )
}
