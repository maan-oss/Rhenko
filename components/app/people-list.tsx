import { PersonRow } from "@/components/app/person-row"
import { withRequested } from "@/lib/people-state"
import type { UserCard } from "@/lib/data"

// A fixed list of people, such as search results. Followers and following use PeoplePager, which pages.
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
    return <p className="px-6 pt-14 pb-16 text-center text-muted-foreground">{emptyText}</p>
  }
  return (
    <ul>
      {withRequested(viewerId, users).map((user) => (
        <PersonRow key={user.id} user={user} viewerId={viewerId} removable={removable} />
      ))}
    </ul>
  )
}
