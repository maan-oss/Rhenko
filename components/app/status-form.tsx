"use client"

import { useActionState, useEffect } from "react"
import { useFormStatus } from "react-dom"
import { toast } from "sonner"
import { setStatus } from "@/actions/account"
import { MAX_STATUS } from "@/lib/rules"

// A one-line status, shown beside your name in the sidebar and on your profile.
export function StatusForm({ status }: { status: string }) {
  const [state, action] = useActionState(setStatus, {})
  useEffect(() => {
    if (state.ok) toast.success("Status saved.")
  }, [state])
  return (
    <form action={action} className="flex flex-col gap-2">
      <label htmlFor="status" className="text-sm font-semibold">
        Status
      </label>
      <div className="flex items-center gap-2">
        <input
          id="status"
          name="status"
          defaultValue={status}
          maxLength={MAX_STATUS}
          placeholder="What are you up to?"
          autoComplete="off"
          className="h-11 min-w-0 flex-1 rounded-full border border-border bg-background px-4 text-[15px] outline-none transition-colors duration-200 placeholder:text-muted-foreground focus-visible:border-foreground/50"
        />
        <SaveStatus />
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">Up to {MAX_STATUS} characters. Shows beside your name.</p>
      )}
    </form>
  )
}

function SaveStatus() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-11 shrink-0 rounded-full bg-foreground px-5 text-[15px] font-semibold text-background transition-opacity duration-200 hover:opacity-85 disabled:opacity-50"
    >
      {pending ? "Saving" : "Save"}
    </button>
  )
}
