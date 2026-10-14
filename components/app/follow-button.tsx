"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { toggleFollow } from "@/actions/social"
import { Button } from "@/components/ui/button"
import { useProofGate } from "@/components/app/proof-dialog"
import { cn } from "@/lib/utils"

export type FollowState = "following" | "requested" | "none"

// Follow, Requested (for protected accounts) or Following. Press again to undo.
// The page tells the button where to start. After a press it shows what the server says happened, and it takes the
// page's word again whenever the page sends a different state.
export function FollowButton({ handle, state, className }: { handle: string; state: FollowState; className?: string }) {
  const [shown, setShown] = useState(state)
  const fromPage = `${handle}:${state}`
  const [seen, setSeen] = useState(fromPage)
  const [pending, startTransition] = useTransition()
  const proof = useProofGate()

  if (seen !== fromPage) {
    setSeen(fromPage)
    setShown(state)
  }

  function press(answer?: string) {
    const before = shown
    const want = before === "none" ? "follow" : "unfollow"
    // Backing out can only end one way, so it shows at once. Following ends as a follow or as a request, so it waits for the server.
    if (want === "unfollow") setShown("none")
    startTransition(async () => {
      const result = await toggleFollow(handle, want, answer)
      if (!result.ok) {
        setShown(before)
        if (result.proofRequired) {
          proof.askForProof((passed) => press(passed))
          return
        }
        toast.error(result.error)
        return
      }
      setShown(result.state)
      if (result.state === "following") toast.success(`You follow @${handle}.`)
      else if (result.state === "requested") toast.success(`Request sent to @${handle}. They decide who can follow them.`)
      else toast.success(before === "requested" ? `Request to @${handle} withdrawn.` : `You unfollowed @${handle}.`)
    })
  }

  if (shown === "none") {
    return (
      <>
        <Button
          type="button"
          onClick={() => press()}
          disabled={pending}
          aria-busy={pending}
          aria-label={`Follow @${handle}`}
          className={cn("h-10 min-w-24 rounded-full px-4 font-semibold sm:h-8", className)}
        >
          Follow
        </Button>
        {proof.dialog}
      </>
    )
  }

  const requested = shown === "requested"
  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => press()}
        disabled={pending}
        aria-busy={pending}
        aria-label={requested ? `Withdraw follow request to @${handle}` : `Unfollow @${handle}`}
        className={cn("group h-10 min-w-24 rounded-full px-4 font-semibold sm:h-8", className)}
      >
        <span className="group-hover:hidden">{requested ? "Requested" : "Following"}</span>
        <span className="hidden group-hover:inline">{requested ? "Withdraw" : "Unfollow"}</span>
      </Button>
      {proof.dialog}
    </>
  )
}
