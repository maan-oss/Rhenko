"use client"

import { useTransition } from "react"
import { toast } from "sonner"
import { removeFollower } from "@/actions/social"
import { Button } from "@/components/ui/button"

// Removes someone from your followers. They can follow again later.
export function RemoveFollowerButton({ handle }: { handle: string }) {
  const [pending, startTransition] = useTransition()
  return (
    <Button
      type="button"
      variant="outline"
      disabled={pending}
      aria-label={`Remove @${handle} from your followers`}
      onClick={() =>
        startTransition(async () => {
          const result = await removeFollower(handle)
          if (!result.ok) toast.error(result.error)
          else toast.success(`Removed @${handle} from your followers.`)
        })
      }
      className="h-8 rounded-full px-4 font-semibold"
    >
      Remove
    </Button>
  )
}
