"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { joinGroupWithInvite } from "@/actions/messages"
import { emptyActionClass } from "@/components/app/empty-state"
import { cn } from "@/lib/utils"

// Joins the group an invite link opens, then goes to its conversation. The join page replaces itself, so Back doesn't land
// on the invite again.
export function JoinGroupButton({ token, title }: { token: string; title: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function join() {
    setError(null)
    startTransition(async () => {
      const result = await joinGroupWithInvite(token)
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast.success(`You joined ${title}.`)
      router.replace(`/messages/${result.id}`)
    })
  }

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <button
        type="button"
        onClick={join}
        disabled={pending}
        aria-busy={pending}
        className={cn(emptyActionClass("primary"), "w-full disabled:opacity-50")}
      >
        {pending ? "Joining…" : "Join group"}
      </button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
