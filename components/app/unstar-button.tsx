"use client"

import { useTransition } from "react"
import { StarOff } from "lucide-react"
import { toast } from "sonner"
import { toggleStarMessage } from "@/actions/messages"

// Removes a star from a message on the starred list. The list drops the row once the server has run the change.
export function UnstarButton({ messageId }: { messageId: string }) {
  const [pending, startTransition] = useTransition()

  function unstar() {
    startTransition(async () => {
      const result = await toggleStarMessage(messageId)
      if (result.ok) toast.success("Removed from starred messages.")
      else toast.error(result.error)
    })
  }

  return (
    <button
      type="button"
      onClick={unstar}
      disabled={pending}
      aria-label="Remove star"
      title="Remove star"
      className="tap-44 grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
    >
      <StarOff className="size-4" aria-hidden="true" />
    </button>
  )
}
