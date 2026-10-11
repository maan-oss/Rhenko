import { notFound } from "next/navigation"
import { requireViewer } from "@/lib/auth"
import { getProfileByHandle, peopleOf } from "@/lib/data"
import { formatCount, pluralize } from "@/lib/format"
import { PageHeader } from "@/components/app/page-header"
import { PeopleList } from "@/components/app/people-list"
import { UserCheck, Users } from "lucide-react"
import { TabLinks } from "@/components/app/tabs"

// Followers or following for one account, with the same visibility rules as the profile.
export async function PeopleBody({ handle, kind }: { handle: string; kind: "followers" | "following" }) {
  const viewer = await requireViewer()
  const profile = getProfileByHandle(handle, viewer.id)
  const isSelf = profile?.id === viewer.id
  if (!profile || (profile.deactivated && !isSelf) || profile.relationship.blockedMe) notFound()

  const base = `/${profile.handle}`
  const hidden = profile.protected && !isSelf && !profile.relationship.following
  const users = hidden ? [] : peopleOf(kind, profile.id, viewer.id)
  return (
    <>
      <PageHeader title={profile.name} backHref={base} />
      <div className="px-4 pt-3">
        <TabLinks
          items={[
            {
              href: `${base}/followers`,
              label: `${formatCount(profile.followers)} ${pluralize(profile.followers, "Follower")}`,
              icon: <Users />,
              active: kind === "followers",
            },
            { href: `${base}/following`, label: `${formatCount(profile.following)} Following`, icon: <UserCheck />, active: kind === "following" },
          ]}
        />
      </div>
      {hidden ? (
        <p className="px-6 pt-14 pb-16 text-center text-muted-foreground">This account is protected. Follow it to see who it follows.</p>
      ) : (
        <PeopleList
          users={users}
          viewerId={viewer.id}
          removable={isSelf && kind === "followers"}
          emptyText={kind === "followers" ? "No followers yet." : "Not following anyone yet."}
        />
      )}
    </>
  )
}
