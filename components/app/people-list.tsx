import Link from "next/link"
import { Avatar } from "@/components/app/avatar"
import { VerifiedBadge } from "@/components/app/badges"
import { FollowButton } from "@/components/app/follow-button"
import { RemoveFollowerButton } from "@/components/app/remove-follower-button"
import type { UserCard } from "@/lib/data"

export function PeopleList({
  users,
  viewerId,
  removable,
  emptyText,
}: {
  users: UserCard[]
  viewerId: string
  removable: boolean
  emptyText: string
}) {
  if (users.length === 0) {
    return <p className="px-4 py-14 text-center text-muted-foreground">{emptyText}</p>
  }
  return (
    <ul>
      {users.map((user) => (
        <li key={user.id} className="flex items-start gap-3 border-b border-border px-4 py-3">
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
            <RemoveFollowerButton handle={user.handle} />
          ) : user.id !== viewerId ? (
            <FollowButton handle={user.handle} state={user.following ? "following" : "none"} />
          ) : null}
        </li>
      ))}
    </ul>
  )
}
