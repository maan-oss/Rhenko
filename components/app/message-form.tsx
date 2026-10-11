"use client"

import { useActionState, useEffect, useRef } from "react"
import { useFormStatus } from "react-dom"
import { sendMessage, type MessageState } from "@/actions/messages"
import { Button } from "@/components/ui/button"

function SendButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} className="h-11 rounded-lg px-5">
      {pending ? "Sending" : "Send"}
    </Button>
  )
}

export function MessageForm({ handle }: { handle: string }) {
  const [state, action] = useActionState(sendMessage, {} as MessageState)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state.ok) formRef.current?.reset()
  }, [state])

  return (
    <div className="sticky bottom-0 border-t border-border bg-background/95 backdrop-blur">
      {state.error ? (
        <p role="alert" className="px-4 pt-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <form ref={formRef} action={action} className="flex items-end gap-2 p-3">
        <input type="hidden" name="handle" value={handle} />
        <textarea
          name="body"
          required
          rows={1}
          maxLength={1000}
          aria-label="Message"
          placeholder="Start a message"
          className="field-sizing-content max-h-40 min-h-11 flex-1 resize-none rounded-[4px] border border-input bg-background px-3 py-2.5 text-[15px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <SendButton />
      </form>
    </div>
  )
}
