"use client"

import { useTransition } from "react"
import { Bell, BellOff } from "lucide-react"
import { toast } from "sonner"
import { toggleConversationMute } from "@/actions/messages"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

// Mutes a conversation for this account, or lets it count again. It lives in the chat's options menu.
function useMuteToggle(conversationId: string) {
  const [pending, startTransition] = useTransition()

  function toggle() {
    startTransition(async () => {
      const result = await toggleConversationMute(conversationId)
      if (!result.ok) toast.error(result.error)
      else toast.success(result.muted ? "Conversation muted." : "Conversation unmuted.")
    })
  }

  return { pending, toggle }
}

// Its messages stop counting as unread while it is muted.

export function MuteMenuItem({ conversationId, muted, className }: { conversationId: string; muted: boolean; className?: string }) {
  const { pending, toggle } = useMuteToggle(conversationId)

  return (
    <DropdownMenuItem disabled={pending} onClick={toggle} className={cn(className)}>
      {muted ? <BellOff className="size-4" aria-hidden="true" /> : <Bell className="size-4" aria-hidden="true" />}
      {muted ? "Unmute conversation" : "Mute conversation"}
    </DropdownMenuItem>
  )
}
