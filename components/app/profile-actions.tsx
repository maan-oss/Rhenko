"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { Ban, Mail, MoreHorizontal, Volume2, VolumeX } from "lucide-react"
import { toast } from "sonner"
import { startConversation } from "@/actions/messages"
import { toggleBlock, toggleMute } from "@/actions/social"
import { FollowButton, type FollowState } from "@/components/app/follow-button"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

// Message, follow, mute and block for someone else's profile.
export function ProfileActions({
  handle,
  state,
  blocked,
  muted,
}: {
  handle: string
  state: FollowState
  blocked: boolean
  muted: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function message() {
    startTransition(async () => {
      const result = await startConversation(handle)
      if (!result.ok) toast.error(result.error)
      else router.push(`/messages/${result.id}`)
    })
  }

  function block() {
    startTransition(async () => {
      const result = await toggleBlock(handle)
      if (!result.ok) toast.error(result.error)
      else toast.success(result.blocked ? `Blocked @${handle}.` : `Unblocked @${handle}.`)
    })
  }

  function mute() {
    startTransition(async () => {
      const result = await toggleMute(handle)
      if (!result.ok) toast.error(result.error)
      else toast.success(result.muted ? `Muted @${handle}.` : `Unmuted @${handle}.`)
    })
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={`Message @${handle}`}
        disabled={pending}
        onClick={message}
        className="rounded-full"
      >
        <Mail className="size-4" />
      </Button>
      <FollowButton handle={handle} state={state} />
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="More options"
          className="grid size-8 place-items-center rounded-full border border-border transition-colors hover:bg-muted"
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52">
          <DropdownMenuItem onClick={mute}>
            {muted ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
            {muted ? `Unmute @${handle}` : `Mute @${handle}`}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={block} className={cn(!blocked && "text-destructive")}>
            <Ban className="size-4" />
            {blocked ? `Unblock @${handle}` : `Block @${handle}`}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
