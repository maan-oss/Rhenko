"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { openConversation, type OpenState } from "@/actions/messages"
import { Button } from "@/components/ui/button"

function OpenButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} className="h-10 rounded-lg px-4">
      {pending ? "Opening" : "Open"}
    </Button>
  )
}

export function NewConversation() {
  const [state, action] = useActionState(openConversation, {} as OpenState)
  return (
    <form action={action} className="flex flex-col gap-2 border-b border-border px-4 py-4">
      <label htmlFor="open-handle" className="text-sm font-semibold">
        Message someone
      </label>
      <div className="flex gap-2">
        <input
          id="open-handle"
          name="handle"
          required
          placeholder="@handle"
          className="h-10 min-w-0 flex-1 rounded-[4px] border border-input bg-background px-3 text-[15px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <OpenButton />
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
    </form>
  )
}
