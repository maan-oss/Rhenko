"use client"

import { useTransition } from "react"
import { Bell, BellOff } from "lucide-react"
import { toast } from "sonner"
import { toggleConversationMute } from "@/actions/messages"
import { Button } from "@/components/ui/button"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

// Mutes a conversation for this account, or lets it count again. The header button and the phone's options menu share it.
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

// Its messages stop counting as unread while it is muted. The header shows it on a computer; a phone keeps it in the options menu.
export function MuteConversationButton({ conversationId, muted }: { conversationId: string; muted: boolean }) {
  const { pending, toggle } = useMuteToggle(conversationId)

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={muted ? "Unmute conversation" : "Mute conversation"}
      disabled={pending}
      onClick={toggle}
      className="size-11 rounded-full"
    >
      {muted ? <BellOff className="size-[22px]" strokeWidth={1.9} /> : <Bell className="size-[22px]" strokeWidth={1.9} />}
    </Button>
  )
}

// The same switch as a row in a menu.
export function MuteMenuItem({ conversationId, muted, className }: { conversationId: string; muted: boolean; className?: string }) {
  const { pending, toggle } = useMuteToggle(conversationId)

  return (
    <DropdownMenuItem disabled={pending} onClick={toggle} className={cn(className)}>
      {muted ? <BellOff className="size-4" aria-hidden="true" /> : <Bell className="size-4" aria-hidden="true" />}
      {muted ? "Unmute conversation" : "Mute conversation"}
    </DropdownMenuItem>
  )
}
