"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { acceptFollowRequest, declineFollowRequest } from "@/actions/social"
import { Avatar } from "@/components/app/avatar"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export function FollowRequestRow({ user }: { user: { handle: string; name: string; avatarFile: string | null; id: string } }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function respond(accept: boolean) {
    startTransition(async () => {
      const result = accept ? await acceptFollowRequest(user.handle) : await declineFollowRequest(user.handle)
      if (!result.ok) toast.error(result.error)
      else {
        toast.success(accept ? `@${user.handle} can follow you now.` : `Declined @${user.handle}.`)
        router.refresh()
      }
    })
  }

  return (
    <li className="flex items-center gap-3 border-b border-border px-4 py-3">
      <Link href={`/${user.handle}`} className="shrink-0">
        <Avatar user={user} size={44} />
      </Link>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{user.name}</p>
        <p className="truncate text-sm text-muted-foreground">@{user.handle} wants to follow you</p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button type="button" variant="outline" disabled={pending} onClick={() => respond(false)} className="h-8 rounded-full px-3">
          Decline
        </Button>
        <Button type="button" disabled={pending} onClick={() => respond(true)} className="h-8 rounded-full px-3">
          Accept
        </Button>
      </div>
    </li>
  )
}
