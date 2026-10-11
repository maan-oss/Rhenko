"use client"

import { startTransition, useActionState, useState } from "react"
import { toast } from "sonner"
import { setStatus, type StatusState } from "@/actions/account"
import { ErrorLine, FIELD_INPUT } from "@/components/app/form-bits"
import { Button } from "@/components/ui/button"
import { cleanStatus, MAX_STATUS } from "@/lib/account-rules"
import { countChars } from "@/lib/rules"
import { cn } from "@/lib/utils"

// A one-line status beside your name. Saving an empty line clears it.
export function StatusForm({ status }: { status: string }) {
  const [value, setValue] = useState(status)
  const [saved, setSaved] = useState(status)
  const [state, action, pending] = useActionState(async (prev: StatusState, formData: FormData): Promise<StatusState> => {
    const result = await setStatus(prev, formData)
    if (result.ok) {
      const next = result.status ?? ""
      setSaved(next)
      setValue(next)
      toast.success(next ? "Status saved." : "Status cleared.")
    }
    return result
  }, {})

  const length = countChars(cleanStatus(value))
  const over = length > MAX_STATUS
  const changed = cleanStatus(value) !== saved

  function clear() {
    const data = new FormData()
    data.set("status", "")
    startTransition(() => action(data))
  }

  return (
    <form action={action} className="flex flex-col gap-2">
      <label htmlFor="account-status" className="text-sm font-semibold">
        Status
      </label>
      <div className="flex items-center gap-2">
        <input
          id="account-status"
          name="status"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="What are you up to?"
          autoComplete="off"
          aria-invalid={over || undefined}
          aria-describedby="account-status-hint"
          className={cn(FIELD_INPUT, "min-w-0 flex-1", over && "border-destructive focus-visible:border-destructive")}
        />
        <Button type="submit" disabled={pending || over || !changed} className="h-11 shrink-0 rounded-lg px-5">
          {pending ? "Saving" : "Save"}
        </Button>
      </div>
      <div className="flex items-start justify-between gap-3 text-xs">
        <span id="account-status-hint" className={over ? "text-destructive" : "text-muted-foreground"}>
          {over
            ? `That's ${length - MAX_STATUS} over the ${MAX_STATUS}-character limit.`
            : "Shows with your name on your profile and in the sidebar."}
        </span>
        <span className={cn("shrink-0 tabular-nums", over ? "text-destructive" : "text-muted-foreground")}>
          {length}/{MAX_STATUS}
        </span>
      </div>
      <ErrorLine message={state.error} />
      {saved ? (
        <div>
          <Button type="button" variant="outline" disabled={pending} onClick={clear} className="h-9 rounded-full px-4">
            Clear status
          </Button>
        </div>
      ) : null}
    </form>
  )
}
