"use client"

import { useOptimistic, useTransition } from "react"
import { toast } from "sonner"
import { toggleFollow } from "@/actions/social"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function FollowButton({ handle, following, className }: { handle: string; following: boolean; className?: string }) {
  const [shown, setShown] = useOptimistic(following)
  const [, startTransition] = useTransition()

  function onClick() {
    const next = !shown
    startTransition(async () => {
      setShown(next)
      const result = await toggleFollow(handle)
      if (!result.ok) toast.error(result.error)
    })
  }

  return (
    <Button
      type="button"
      variant={shown ? "outline" : "default"}
      onClick={onClick}
      aria-label={shown ? `Unfollow ${handle}` : `Follow ${handle}`}
      className={cn("group h-8 min-w-24 rounded-lg px-4", className)}
    >
      {shown ? (
        <>
          <span className="group-hover:hidden">Following</span>
          <span className="hidden group-hover:inline">Unfollow</span>
        </>
      ) : (
        "Follow"
      )}
    </Button>
  )
}
