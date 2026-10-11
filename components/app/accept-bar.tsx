"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { acceptConversation, declineConversation } from "@/actions/messages"
import { Button } from "@/components/ui/button"

// A message request: they can't reply until you accept. Declining removes the conversation.
export function AcceptBar({ conversationId }: { conversationId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <div className="flex flex-col gap-3 border-b border-border bg-muted/50 px-4 py-4">
      <p className="text-[15px]">Accept this message request to reply. Until you do, they can&apos;t see that you&apos;ve read it.</p>
      <div className="flex gap-2">
        <Button
          type="button"
          disabled={pending}
          className="h-9 rounded-full px-4"
          onClick={() =>
            startTransition(async () => {
              const result = await acceptConversation(conversationId)
              if (!result.ok) toast.error(result.error)
              else router.refresh()
            })
          }
        >
          Accept
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          className="h-9 rounded-full px-4"
          onClick={() =>
            startTransition(async () => {
              const result = await declineConversation(conversationId)
              if (!result.ok) toast.error(result.error)
              else router.push("/messages?tab=requests")
            })
          }
        >
          Decline
        </Button>
      </div>
    </div>
  )
}
