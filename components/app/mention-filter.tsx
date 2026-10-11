"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { setMentionsVerifiedOnly } from "@/actions/notifications"
import { cn } from "@/lib/utils"

// Mention notifications come only from verified accounts when this is on.
export function MentionFilterChoice({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial)
  const [pending, startTransition] = useTransition()

  function toggle() {
    const next = !on
    setOn(next)
    startTransition(async () => {
      const result = await setMentionsVerifiedOnly(next)
      if (!result.ok) {
        setOn(!next)
        toast.error("Couldn't save that. Try again.")
      }
    })
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Mentions from verified accounts only"
      disabled={pending}
      onClick={toggle}
      className="flex w-full items-center justify-between gap-4 rounded-lg border border-border px-4 py-3 text-left transition-colors hover:bg-muted disabled:opacity-60"
    >
      <span className="flex flex-col gap-0.5">
        <span className="text-[15px] font-semibold">Only verified accounts can notify you by mention</span>
        <span className="text-sm text-muted-foreground">Mentions from other accounts still show up in your posts and conversations, but not in notifications.</span>
      </span>
      <span aria-hidden className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", on ? "bg-dusk" : "bg-muted-foreground/40")}>
        <span className={cn("absolute top-0.5 left-0.5 size-5 rounded-full bg-background shadow transition-transform", on && "translate-x-5")} />
      </span>
    </button>
  )
}
