"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { toggleTopicFollow } from "@/actions/social"
import { Button } from "@/components/ui/button"

export function TopicFollowButton({ tag, following }: { tag: string; following: boolean }) {
  const [on, setOn] = useState(following)
  const [pending, startTransition] = useTransition()
  return (
    <Button
      type="button"
      variant={on ? "outline" : "default"}
      disabled={pending}
      aria-pressed={on}
      onClick={() =>
        startTransition(async () => {
          const result = await toggleTopicFollow(tag)
          if (!result.ok) toast.error(result.error)
          else {
            setOn(result.following === true)
            toast.success(result.following ? `Following #${tag}.` : `Unfollowed #${tag}.`)
          }
        })
      }
      className="h-8 rounded-full px-4 font-semibold"
    >
      {on ? "Following" : "Follow"}
    </Button>
  )
}
