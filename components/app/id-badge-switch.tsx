"use client"

import { useState, useTransition } from "react"
import { setIdBadge } from "@/actions/age"
import { ErrorLine } from "@/components/app/form-bits"
import { cn } from "@/lib/utils"

// Turns the ID-checked mark on or off. It is a switch like the Priority ones, so it behaves the same way.
export function IdBadgeSwitch({ on }: { on: boolean }) {
  const [shown, setShown] = useState(on)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={shown}
        disabled={pending}
        onClick={() => {
          const next = !shown
          setError(null)
          startTransition(async () => {
            const result = await setIdBadge(next)
            if (!result.ok) {
              setError(result.error)
              return
            }
            setShown(next)
          })
        }}
        className="flex w-full items-center justify-between gap-4 rounded-lg border border-border px-4 py-3 text-left transition-colors hover:bg-muted disabled:opacity-50"
      >
        <span className="text-[15px] font-semibold">Show ID checked on my profile</span>
        <span aria-hidden className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", shown ? "bg-dusk" : "bg-muted-foreground/40")}>
          <span className={cn("absolute top-0.5 left-0.5 size-5 rounded-full bg-background shadow transition-transform", shown && "translate-x-5")} />
        </span>
      </button>
      <ErrorLine message={error ?? undefined} />
    </div>
  )
}
