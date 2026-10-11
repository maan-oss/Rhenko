"use client"

import { useTransition } from "react"
import { Bell, BellOff } from "lucide-react"
import { toast } from "sonner"
import { toggleConversationMute } from "@/actions/messages"
import { Button } from "@/components/ui/button"

// Mutes a conversation for this account. Its messages stop counting as unread.
export function MuteConversationButton({ conversationId, muted }: { conversationId: string; muted: boolean }) {
  const [pending, startTransition] = useTransition()

  function toggle() {
    startTransition(async () => {
      const result = await toggleConversationMute(conversationId)
      if (!result.ok) toast.error(result.error)
      else toast.success(result.muted ? "Conversation muted." : "Conversation unmuted.")
    })
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label={muted ? "Unmute conversation" : "Mute conversation"}
      disabled={pending}
      onClick={toggle}
      className="rounded-full"
    >
      {muted ? <BellOff className="size-4" /> : <Bell className="size-4" />}
    </Button>
  )
}
