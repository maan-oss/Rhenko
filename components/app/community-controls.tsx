"use client"

import { useActionState, useState, useTransition } from "react"
import { useFormStatus } from "react-dom"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { createCommunity, deleteCommunity, toggleCommunityMembership, type IdResult } from "@/actions/communities"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { Button } from "@/components/ui/button"
import { MAX_COMMUNITY_DESCRIPTION, MAX_COMMUNITY_NAME } from "@/lib/rules"

const INPUT =
  "h-11 rounded-[4px] border border-input bg-background px-3 text-[15px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} className="h-11 rounded-lg px-5">
      {pending ? "Creating" : "Create community"}
    </Button>
  )
}

export function CreateCommunityForm() {
  const router = useRouter()
  const [state, action] = useActionState(
    async (_prev: { error?: string }, formData: FormData): Promise<{ error?: string }> => {
      const result: IdResult = await createCommunity(formData)
      if (!result.ok) return { error: result.error }
      toast.success("Community created.")
      router.push(`/communities/${result.id}`)
      return {}
    },
    {}
  )
  return (
    <form action={action} className="flex flex-col gap-3 border-b border-border px-4 py-5">
      <p className="text-lg font-semibold">Start a community</p>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">Name</span>
        <input name="name" required maxLength={MAX_COMMUNITY_NAME} className={INPUT} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">About</span>
        <textarea
          name="description"
          rows={2}
          maxLength={MAX_COMMUNITY_DESCRIPTION}
          className="rounded-[4px] border border-input bg-background px-3 py-2 text-[15px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </label>
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <div className="flex justify-end">
        <SubmitButton />
      </div>
    </form>
  )
}

export function MembershipButton({ communityId, joined }: { communityId: string; joined: boolean }) {
  const [on, setOn] = useState(joined)
  const [pending, startTransition] = useTransition()
  return (
    <Button
      type="button"
      variant={on ? "outline" : "default"}
      disabled={pending}
      className="h-9 rounded-full px-4 font-semibold"
      onClick={() =>
        startTransition(async () => {
          const result = await toggleCommunityMembership(communityId)
          if (!result.ok) toast.error(result.error)
          else {
            setOn(result.joined)
            toast.success(result.joined ? "Joined the community." : "Left the community.")
          }
        })
      }
    >
      {on ? "Joined" : "Join"}
    </Button>
  )
}

export function DeleteCommunityButton({ communityId }: { communityId: string }) {
  const router = useRouter()
  return (
    <ConfirmDialog
      trigger={
        <Button type="button" variant="outline" className="h-9 rounded-lg px-4 text-destructive">
          Delete community
        </Button>
      }
      title="Delete this community?"
      description="Its posts stay on Rhenko as ordinary posts, but the community and its member list are removed."
      confirmLabel="Delete community"
      action={() => deleteCommunity(communityId)}
      onDone={() => router.push("/communities")}
    />
  )
}
