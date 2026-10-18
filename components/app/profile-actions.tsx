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

// Opens a direct message with someone. The profile places it under the stats, as a small outline pill.
export function MessageButton({ handle }: { handle: string }) {
  const router = useRouter()
  const [messaging, startMessaging] = useTransition()
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

  return (
    <>
      <Button
        type="button"
        variant="outline"
        aria-label={`Message @${handle}`}
        disabled={messaging}
        onClick={() => message()}
        className="h-9 w-fit rounded-full px-4 font-semibold"
      >
        <Mail className="size-4" aria-hidden="true" />
        Message
      </Button>
      {proof.dialog}
    </>
  )
}

// The actions on someone else's profile, in the header row beside the avatar. Follow leads, and the bell and the menu are square.
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
  const [pending, startTransition] = useTransition()
  const [confirmingBlock, setConfirmingBlock] = useState(false)

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
          className="group h-11 flex-1 rounded-full px-4 font-semibold text-destructive"
        >
          <span className="group-hover:hidden">Blocked</span>
          <span className="hidden group-hover:inline">Unblock</span>
        </Button>
      ) : (
        <>
          <FollowButton handle={handle} state={state} from={from} className="h-11 flex-1 rounded-full sm:h-11" />
          {state === "following" ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={notifying ? `Stop post notifications for @${handle}` : `Get post notifications for @${handle}`}
              aria-pressed={notifying}
              disabled={pending}
              onClick={togglePosts}
              className={cn("size-11 shrink-0 rounded-xl", notifying && "border-foreground text-foreground")}
            >
              {notifying ? <BellRing className="size-4" /> : <Bell className="size-4" />}
            </Button>
          ) : null}
        </>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="More options"
          className="grid size-11 shrink-0 place-items-center rounded-xl border border-border bg-background text-foreground transition-colors hover:bg-muted"
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
    </div>
  )
}
