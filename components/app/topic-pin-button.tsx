"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Pin, PinOff } from "lucide-react"
import { toast } from "sonner"
import { setTopicTab } from "@/actions/home-tabs"
import { Button } from "@/components/ui/button"

// Pins a followed topic as a Home tab, or takes it off. It sits under the topic filter, so a topic is pinned where it is read.
export function TopicPinButton({ tag, pinned, full }: { tag: string; pinned: boolean; full: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  // The button follows the page it is on, and moves at once when the press lands. The page is refreshed for the tab strip.
  const [on, setOn] = useState(pinned)
  const [seen, setSeen] = useState(pinned)
  if (seen !== pinned) {
    setSeen(pinned)
    setOn(pinned)
  }
  const blocked = !on && full

  return (
    <Button
      type="button"
      variant={on ? "outline" : "secondary"}
      disabled={pending || blocked}
      aria-busy={pending}
      aria-pressed={on}
      title={blocked ? "Home is full. Unpin a tab to add this one." : undefined}
      className="h-9 rounded-full px-4 font-semibold"
      onClick={() =>
        startTransition(async () => {
          const result = await setTopicTab(tag, !on)
          if (!result.ok) {
            toast.error(result.error)
            return
          }
          setOn(!on)
          toast.success(on ? `#${tag} is off Home.` : `#${tag} is a tab on Home.`)
          router.refresh()
        })
      }
    >
      {on ? <PinOff className="size-4" aria-hidden="true" /> : <Pin className="size-4" aria-hidden="true" />}
      {on ? "Unpin from Home" : "Pin to Home"}
    </Button>
  )
}
