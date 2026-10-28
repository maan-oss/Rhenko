"use client"

import { useActionState, useState } from "react"
import { useFormStatus } from "react-dom"
import { appealNotice, type LegalState } from "@/actions/legal"

const AREA =
  "w-full min-w-0 rounded-2xl border border-border bg-background px-4 py-3 text-[15px] leading-relaxed outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/60 focus:border-foreground"

function Submit() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-11 w-full rounded-full bg-foreground text-[15px] font-semibold text-background transition-opacity hover:opacity-85 disabled:opacity-50"
    >
      {pending ? "Sending…" : "Send appeal"}
    </button>
  )
}

// One appeal per hidden post, written in the author's own words. A person reads it and decides.
export function AppealForm({ noticeId }: { noticeId: string }) {
  const [state, formAction] = useActionState(appealNotice, {} as LegalState)
  const [reason, setReason] = useState("")
  const field = `appeal-${noticeId}`

  if (state.ok) {
    return (
      <p role="status" className="text-[15px] leading-relaxed">
        Your appeal is in. A person will decide it, and the decision will show here.
      </p>
    )
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="notice" value={noticeId} />
      <label htmlFor={field} className="text-[14px] font-semibold">
        Why should this decision change?
      </label>
      <textarea
        id={field}
        name="reason"
        required
        minLength={10}
        maxLength={2000}
        rows={4}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Say what you think was wrong, and anything that shows it. At least 10 characters."
        className={AREA}
      />
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <Submit />
    </form>
  )
}
