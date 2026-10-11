import { notFound } from "next/navigation"
import { requireViewer } from "@/lib/auth"
import { getProfileByHandle, peopleOf } from "@/lib/data"
import { PageHeader } from "@/components/app/page-header"
import { PeopleList } from "@/components/app/people-list"
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
      <TabLinks
        items={[
          { href: `${base}/followers`, label: `${profile.followers} Followers`, active: kind === "followers" },
          { href: `${base}/following`, label: `${profile.following} Following`, active: kind === "following" },
        ]}
      />
      {hidden ? (
        <p className="px-4 py-14 text-center text-muted-foreground">This account is protected. Follow it to see who it follows.</p>
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
