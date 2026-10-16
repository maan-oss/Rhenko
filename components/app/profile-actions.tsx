"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Ban, Bell, BellRing, Mail, MoreHorizontal, Volume2, VolumeX } from "lucide-react"
import { toast } from "sonner"
import { startConversation } from "@/actions/messages"
import { toggleBlock, toggleMute, togglePostNotifications } from "@/actions/social"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { FollowButton, type FollowState } from "@/components/app/follow-button"
import { useProofGate } from "@/components/app/proof-dialog"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

// The row of buttons on someone else's profile, in the order X shows them: post notifications and message as icons, then
// Follow, then the menu with mute and block. Follow is the one filled button, so it reads first.
export function ProfileActions({
  handle,
  state,
  blocked,
  muted,
  notifying,
  from,
}: {
  handle: string
  state: FollowState
  blocked: boolean
  muted: boolean
  notifying: boolean
  // The post the profile was opened from, if any. A follow made here is credited to it.
  from?: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [messaging, startMessaging] = useTransition()
  const [confirmingBlock, setConfirmingBlock] = useState(false)
  const proof = useProofGate()

  // Opens a direct message with this account. The server decides whether it may be sent.
  function message(answer?: string) {
    startMessaging(async () => {
      const result = await startConversation(handle, answer)
      if (!result.ok) {
        if (result.proofRequired) {
          proof.askForProof((passed) => message(passed))
          return
        }
        toast.error(result.error)
      } else router.push(`/messages/${result.id}`)
    })
  }

  function togglePosts() {
    startTransition(async () => {
      const result = await togglePostNotifications(handle)
      if (!result.ok) toast.error(result.error)
      else toast.success(result.notifying ? `You'll hear about new posts from @${handle}.` : `Post notifications off for @${handle}.`)
    })
  }

  function unblock() {
    startTransition(async () => {
      const result = await toggleBlock(handle, false)
      if (!result.ok) toast.error(result.error)
      else toast.success(`Unblocked @${handle}. You don't follow each other now, so follow again if you want to.`)
    })
  }

  function mute() {
    startTransition(async () => {
      const result = await toggleMute(handle, !muted)
      if (!result.ok) toast.error(result.error)
      else toast.success(result.muted ? `Muted @${handle}. Their posts stay out of your feeds, and they aren't told.` : `Unmuted @${handle}.`)
    })
  }

  return (
    <div className="flex items-center gap-2">
      {blocked ? (
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={unblock}
          aria-label={`Unblock @${handle}`}
          className="group h-9 min-w-24 rounded-full px-4 font-semibold text-destructive"
        >
          <span className="group-hover:hidden">Blocked</span>
          <span className="hidden group-hover:inline">Unblock</span>
        </Button>
      ) : (
        <>
          {state === "following" ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={notifying ? `Stop post notifications for @${handle}` : `Get post notifications for @${handle}`}
              aria-pressed={notifying}
              disabled={pending}
              onClick={togglePosts}
              className={cn("size-9 rounded-full", notifying && "border-foreground text-foreground")}
            >
              {notifying ? <BellRing className="size-4" /> : <Bell className="size-4" />}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={`Message @${handle}`}
            disabled={messaging}
            onClick={() => message()}
            className="size-9 rounded-full"
          >
            <Mail className="size-4" />
          </Button>
          <FollowButton handle={handle} state={state} from={from} className="h-9 min-w-24 sm:h-9" />
        </>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="More options"
          className="grid size-9 place-items-center rounded-full border border-border bg-background text-foreground transition-colors hover:bg-muted"
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52">
          <DropdownMenuItem onClick={mute}>
            {muted ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
            {muted ? `Unmute @${handle}` : `Mute @${handle}`}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={blocked ? unblock : () => setConfirmingBlock(true)} className={cn(!blocked && "text-destructive")}>
            <Ban className="size-4" />
            {blocked ? `Unblock @${handle}` : `Block @${handle}`}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirmingBlock}
        onOpenChange={setConfirmingBlock}
        title={`Block @${handle}?`}
        description={`They won't be able to follow you, see your posts or message you, and you won't see theirs. Any follow between you ends, and unblocking doesn't bring it back.`}
        confirmLabel="Block"
        action={() => toggleBlock(handle, true)}
        onDone={() => toast.success(`Blocked @${handle}.`)}
      />
      {proof.dialog}
    </div>
  )
}
