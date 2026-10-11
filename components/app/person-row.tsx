import Link from "next/link"
import { Avatar } from "@/components/app/avatar"
import { VerifiedBadge } from "@/components/app/badges"
import { FollowButton } from "@/components/app/follow-button"
import { RemoveFollowerButton } from "@/components/app/remove-follower-button"
import type { PersonEntry } from "@/lib/social-rules"

// One person in a list of people: who they are, their bio, and the one thing to do about them. On your own followers
// that is Remove. Anywhere else it is Follow, Requested or Following. It renders on the server and in the browser.
export function PersonRow({
  user,
  viewerId,
  removable,
  onRemoved,
}: {
  user: PersonEntry
  viewerId: string
  removable: boolean
  onRemoved?: (userId: string) => void
}) {
  return (
    <li className="flex items-start gap-3 border-b border-border px-4 py-3">
      <Link href={`/${user.handle}`} className="shrink-0" aria-label={`${user.name}'s profile`}>
        <Avatar user={user} size={44} />
      </Link>
      <div className="min-w-0 flex-1">
        <Link href={`/${user.handle}`} className="block min-w-0">
          <span className="flex items-center gap-1 font-semibold">
            <span className="truncate">{user.name}</span>
            {user.verified ? <VerifiedBadge /> : null}
          </span>
          <span className="block truncate text-sm text-muted-foreground">@{user.handle}</span>
        </Link>
        {user.bio ? <p className="mt-1 line-clamp-2 text-[15px]">{user.bio}</p> : null}
        {user.followsMe && user.id !== viewerId ? <p className="mt-1 text-xs text-muted-foreground">Follows you</p> : null}
      </div>
      {removable ? (
        <RemoveFollowerButton handle={user.handle} onRemoved={onRemoved ? () => onRemoved(user.id) : undefined} />
      ) : user.id !== viewerId ? (
        <FollowButton handle={user.handle} state={user.following ? "following" : user.requested ? "requested" : "none"} />
      ) : null}
    </li>
  )
}
