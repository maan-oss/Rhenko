"use client"

import { useOptimistic, useTransition } from "react"
import { toast } from "sonner"
import { toggleFollow } from "@/actions/social"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type FollowState = "following" | "requested" | "none"

// Follow, Requested (for protected accounts) or Following. Press again to undo.
export function FollowButton({ handle, state, className }: { handle: string; state: FollowState; className?: string }) {
  const [shown, setShown] = useOptimistic(state)
  const [, startTransition] = useTransition()

  function onClick() {
    const next: FollowState = shown === "none" ? "following" : "none"
    startTransition(async () => {
      setShown(shown === "none" ? "requested" : "none")
      const result = await toggleFollow(handle)
      if (!result.ok) toast.error(result.error)
      else if (result.state === "requested") toast.success(`Requested @${handle}. They'll decide who can follow.`)
      void next
    })
  }

  if (shown === "none") {
    return (
      <Button type="button" onClick={onClick} aria-label={`Follow ${handle}`} className={cn("h-8 min-w-24 rounded-full px-4 font-semibold", className)}>
        Follow
      </Button>
    )
  }

  const label = shown === "requested" ? "Requested" : "Following"
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      aria-label={shown === "requested" ? `Cancel request to follow ${handle}` : `Unfollow ${handle}`}
      className={cn("group h-8 min-w-24 rounded-full px-4 font-semibold", className)}
    >
      <span className="group-hover:hidden">{label}</span>
      <span className="hidden group-hover:inline">{shown === "requested" ? "Cancel" : "Unfollow"}</span>
    </Button>
  )
}
