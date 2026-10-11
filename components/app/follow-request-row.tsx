"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { acceptFollowRequest, declineFollowRequest } from "@/actions/social"
import { Avatar } from "@/components/app/avatar"
import { Button } from "@/components/ui/button"

// Someone asked to follow a protected account. Accept lets them follow. Decline clears the request.
export function FollowRequestRow({ user }: { user: { handle: string; name: string; avatarFile: string | null; id: string } }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [answer, setAnswer] = useState<"accepted" | "declined" | null>(null)

  function respond(accept: boolean) {
    startTransition(async () => {
      const result = accept ? await acceptFollowRequest(user.handle) : await declineFollowRequest(user.handle)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setAnswer(accept ? "accepted" : "declined")
      toast.success(accept ? `@${user.handle} follows you now.` : `Declined the request from @${user.handle}.`)
      router.refresh()
    })
  }

  return (
    <li className="flex items-center gap-3 border-b border-border px-4 py-3">
      <Link href={`/${user.handle}`} className="shrink-0" aria-label={`${user.name}'s profile`}>
        <Avatar user={user} size={44} />
      </Link>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{user.name}</p>
        <p className="truncate text-sm text-muted-foreground">@{user.handle} wants to follow you</p>
      </div>
      {answer ? (
        <p className="shrink-0 text-sm font-semibold text-muted-foreground" role="status">
          {answer === "accepted" ? "Accepted" : "Declined"}
        </p>
      ) : (
        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => respond(false)}
            aria-label={`Decline the request from @${user.handle}`}
            className="h-8 rounded-full px-3"
          >
            Decline
          </Button>
          <Button
            type="button"
            disabled={pending}
            onClick={() => respond(true)}
            aria-label={`Accept the request from @${user.handle}`}
            className="h-8 rounded-full px-3"
          >
            Accept
          </Button>
        </div>
      )}
    </li>
  )
}
