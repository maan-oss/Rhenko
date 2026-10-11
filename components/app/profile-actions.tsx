"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { Ban, Bell, BellRing, Mail, MoreHorizontal, Volume2, VolumeX } from "lucide-react"
import { toast } from "sonner"
import { startConversation } from "@/actions/messages"
import { toggleBlock, toggleMute, togglePostNotifications } from "@/actions/social"
import { FollowButton, type FollowState } from "@/components/app/follow-button"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

// Opens a direct message with someone. The profile page places it under the mutual followers line.
export function MessageButton({ handle }: { handle: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function message() {
    startTransition(async () => {
      const result = await startConversation(handle)
      if (!result.ok) toast.error(result.error)
      else router.push(`/messages/${result.id}`)
    })
  }

  return (
    <Button type="button" variant="outline" disabled={pending} onClick={message} className="h-9 w-fit rounded-full px-4">
      <Mail className="size-4" />
      Message
    </Button>
  )
}

// Follow, notifications, mute and block for someone else's profile.
export function ProfileActions({
  handle,
  state,
  blocked,
  muted,
  notifying,
}: {
  handle: string
  state: FollowState
  blocked: boolean
  muted: boolean
  notifying: boolean
}) {
  const [pending, startTransition] = useTransition()

  function togglePosts() {
    startTransition(async () => {
      const result = await togglePostNotifications(handle)
      if (!result.ok) toast.error(result.error)
      else toast.success(result.notifying ? `You'll hear about new posts from @${handle}.` : `Post notifications off for @${handle}.`)
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
      {state === "following" ? (
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={notifying ? `Stop post notifications for @${handle}` : `Get post notifications for @${handle}`}
          aria-pressed={notifying}
          disabled={pending}
          onClick={togglePosts}
          className={cn("rounded-full", notifying && "border-dusk text-dusk")}
        >
          {notifying ? <BellRing className="size-4" /> : <Bell className="size-4" />}
        </Button>
      ) : null}
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
