"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { setTopicFollow } from "@/actions/social"
import { Button } from "@/components/ui/button"

// Follow a topic to see its posts in your Following feed. The page tells the button where to start, and after a press it
// shows what the server says is true.
export function TopicFollowButton({ tag, following }: { tag: string; following: boolean }) {
  const [on, setOn] = useState(following)
  // What the page last said, for this topic. A different topic or a changed answer from the page replaces what is shown.
  const fromPage = `${tag}:${following}`
  const [seen, setSeen] = useState(fromPage)
  const [pending, startTransition] = useTransition()

  if (seen !== fromPage) {
    setSeen(fromPage)
    setOn(following)
  }

  return (
    <Button
      type="button"
      variant={on ? "outline" : "default"}
      disabled={pending}
      aria-busy={pending}
      aria-pressed={on}
      aria-label={on ? `Following the topic #${tag}` : `Follow the topic #${tag}`}
      onClick={() =>
        startTransition(async () => {
          const result = await setTopicFollow(tag, !on)
          if (!result.ok) {
            toast.error(result.error)
            return
          }
          setOn(result.following)
          toast.success(result.following ? `You follow #${tag}. Its posts show in your Following feed.` : `You unfollowed #${tag}.`)
        })
      }
      className="h-8 rounded-full px-4 font-semibold"
    >
      {on ? "Following" : "Follow"}
    </Button>
  )
}
