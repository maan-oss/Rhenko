"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { createGroup, startConversation } from "@/actions/messages"
import { Button } from "@/components/ui/button"
import { useProofGate } from "@/components/app/proof-dialog"
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
  const proof = useProofGate()
  const open = (handle: string, answer?: string) => {
    startTransition(async () => {
      const result = await startConversation(handle, answer)
      if (!result.ok) {
        if (result.proofRequired) {
          proof.askForProof((passed) => open(handle, passed))
          return
        }
        setError(result.error)
      } else router.push(`/messages/${result.id}`)
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
    <>
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
    {proof.dialog}
    </>
  )
}

// A group with two or more other people. Message requests apply to each person who doesn't follow you, and each of those
// counts as a new conversation, so a busy account may be asked for the human check first. The group is then sent again
// with the answer.
export function NewGroupForm() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const proof = useProofGate()
  const create = (data: FormData) => {
    startTransition(async () => {
      const result = await createGroup({}, data)
      if (result.id) {
        setError(null)
        toast.success("Group created.")
        router.push(`/messages/${result.id}`)
        return
      }
      if (result.proofRequired) {
        proof.askForProof((passed) => {
          const again = new FormData()
          for (const [key, value] of data) if (key !== "proof") again.append(key, value)
          again.set("proof", passed)
          create(again)
        })
        return
      }
      setError(result.error ?? "The group couldn't be created. Try again.")
    })
  }
  return (
    <>
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        create(new FormData(event.currentTarget))
      }}
    >
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
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending} className="h-11 rounded-lg px-5">
          {pending ? "Creating" : "Create group"}
        </Button>
      </div>
    </form>
    {proof.dialog}
    </>
  )
}
