"use client"

import { useActionState, useEffect, useRef, useState, useTransition } from "react"
import { useFormStatus } from "react-dom"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { createGroup, startConversation, type ChatState } from "@/actions/messages"
import { Button } from "@/components/ui/button"
import { MAX_GROUP_TITLE } from "@/lib/rules"

const INPUT =
  "h-11 min-w-0 rounded-xl border border-input bg-background px-3 text-[15px] outline-none focus-visible:border-foreground/50"

// Start a one-to-one message with a handle. With `defaultHandle` (from a Message button on a suggestion) the conversation
// opens by itself: nothing is sent, and the person writes their first message in it.
export function NewChatForm({ defaultHandle }: { defaultHandle?: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)
  const open = (handle: string) => {
    startTransition(async () => {
      const result = await startConversation(handle)
      if (!result.ok) setError(result.error)
      else router.push(`/messages/${result.id}`)
    })
  }
  useEffect(() => {
    if (!defaultHandle || started.current) return
    started.current = true
    open(defaultHandle)
    // Opens once, for the handle the page was given.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultHandle])
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        open(String(new FormData(event.currentTarget).get("handle") ?? "").trim().replace(/^@/, ""))
      }}
    >
      <label htmlFor="chat-handle" className="text-sm font-semibold">
        Handle
      </label>
      <div className="flex gap-2">
        <input
          id="chat-handle"
          name="handle"
          required
          placeholder="@someone"
          autoComplete="off"
          defaultValue={defaultHandle ? `@${defaultHandle}` : undefined}
          className={`${INPUT} flex-1`}
        />
        <Button type="submit" disabled={pending} className="h-11 rounded-lg px-5">
          {pending ? "Opening" : "Next"}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  )
}

function CreateButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} className="h-11 rounded-lg px-5">
      {pending ? "Creating" : "Create group"}
    </Button>
  )
}

// A group with two or more other people. Message requests apply to each person who doesn't follow you.
export function NewGroupForm() {
  const router = useRouter()
  const [state, action] = useActionState(createGroup, {} as ChatState & { id?: string })
  useEffect(() => {
    if (state.id) {
      toast.success("Group created.")
      router.push(`/messages/${state.id}`)
    }
  }, [state.id, router])
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">Group name (optional)</span>
        <input name="title" maxLength={MAX_GROUP_TITLE} className={INPUT} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">People</span>
        <textarea
          name="handles"
          rows={2}
          required
          placeholder="Handles, separated by spaces or commas"
          className="rounded-xl border border-input bg-background px-3 py-2 text-[15px] outline-none focus-visible:border-foreground/50"
        />
      </label>
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <div className="flex justify-end">
        <CreateButton />
      </div>
    </form>
  )
}
