"use client"

import { useActionState, useRef, useState, useTransition } from "react"
import { useFormStatus } from "react-dom"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { addListMember, createList, deleteList, removeListMember, toggleListFollow, type ListResult } from "@/actions/lists"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { Button } from "@/components/ui/button"
import { MAX_LIST_DESCRIPTION, MAX_LIST_NAME } from "@/lib/rules"

const INPUT =
  "h-11 rounded-xl border border-input bg-background px-3 text-[15px] outline-none focus-visible:border-foreground/50"

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} className="h-11 rounded-lg px-5">
      {pending ? pendingLabel : label}
    </Button>
  )
}

export function CreateListForm() {
  const router = useRouter()
  const [state, action] = useActionState(
    async (_prev: { error?: string }, formData: FormData): Promise<{ error?: string }> => {
      const result: ListResult = await createList(formData)
      if (!result.ok) return { error: result.error }
      toast.success("List created.")
      router.push(`/lists/${result.id}`)
      return {}
    },
    {}
  )
  return (
    <form action={action} className="flex flex-col gap-3 border-b border-border px-4 py-5">
      <p className="text-lg font-semibold">Make a list</p>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">Name</span>
        <input name="name" required maxLength={MAX_LIST_NAME} placeholder="Friends from school" className={INPUT} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">Description</span>
        <input name="description" maxLength={MAX_LIST_DESCRIPTION} placeholder="Optional" className={INPUT} />
      </label>
      <label className="flex items-center gap-2 text-[15px]">
        <input name="private" type="checkbox" className="size-4 accent-dusk" />
        Private. Only you can see it.
      </label>
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <div className="flex justify-end">
        <SubmitButton label="Create list" pendingLabel="Creating" />
      </div>
    </form>
  )
}

export function ListMemberForm({ listId }: { listId: string }) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <form
      ref={formRef}
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        const handle = String(new FormData(event.currentTarget).get("handle") ?? "")
        startTransition(async () => {
          const result = await addListMember(listId, handle)
          if (!result.ok) setError(result.error)
          else {
            setError(null)
            formRef.current?.reset()
            toast.success("Added to the list.")
            router.refresh()
          }
        })
      }}
    >
      <div className="flex gap-2">
        <input name="handle" required placeholder="Add a person by handle" aria-label="Handle" className={`${INPUT} min-w-0 flex-1`} />
        <Button type="submit" disabled={pending} className="h-11 rounded-lg px-4">
          Add
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

export function ListFollowButton({ listId, following }: { listId: string; following: boolean }) {
  const [on, setOn] = useState(following)
  const [pending, startTransition] = useTransition()
  return (
    <Button
      type="button"
      variant={on ? "outline" : "default"}
      disabled={pending}
      className="h-9 rounded-full px-4 font-semibold"
      onClick={() =>
        startTransition(async () => {
          const result = await toggleListFollow(listId)
          if (!result.ok) toast.error(result.error)
          else setOn(result.following)
        })
      }
    >
      {on ? "Following" : "Follow list"}
    </Button>
  )
}

export function RemoveMemberButton({ listId, userId, handle }: { listId: string; userId: string; handle: string }) {
  const [pending, startTransition] = useTransition()
  return (
    <Button
      type="button"
      variant="outline"
      disabled={pending}
      aria-label={`Remove @${handle} from this list`}
      className="h-8 rounded-full px-3"
      onClick={() =>
        startTransition(async () => {
          const result = await removeListMember(listId, userId)
          if (!result.ok) toast.error(result.error)
        })
      }
    >
      Remove
    </Button>
  )
}

export function DeleteListButton({ listId }: { listId: string }) {
  const router = useRouter()
  return (
    <ConfirmDialog
      trigger={
        <Button type="button" variant="outline" className="h-9 rounded-lg px-4 text-destructive">
          Delete list
        </Button>
      }
      title="Delete this list?"
      description="The list and its members are removed for everyone. Posts stay where they are."
      confirmLabel="Delete list"
      action={() => deleteList(listId)}
      onDone={() => router.push("/lists")}
    />
  )
}
