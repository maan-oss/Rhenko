import { Suspense } from "react"
import Link from "next/link"
import { requireViewer } from "@/lib/auth"
import { communitiesFor } from "@/lib/data"
import { formatCount } from "@/lib/format"
import { CreateCommunityForm, MembershipButton } from "@/components/app/community-controls"
import { PageHeader } from "@/components/app/page-header"

export default function CommunitiesPage() {
  return (
    <Suspense fallback={null}>
      <CommunitiesBody />
    </Suspense>
  )
}

async function CommunitiesBody() {
  const viewer = await requireViewer()
  const communities = communitiesFor(viewer.id)
  return (
    <>
      <PageHeader title="Communities" />
      <CreateCommunityForm />
      {communities.length === 0 ? (
        <p className="px-4 py-14 text-center text-muted-foreground">No communities yet. Start one above.</p>
      ) : (
        <ul className="list-none">
          {communities.map((community) => (
            <li key={community.id} className="flex items-center gap-3 border-b border-border px-4 py-4">
              <Link href={`/communities/${community.id}`} className="min-w-0 flex-1">
                <span className="block truncate text-[17px] font-semibold">{community.name}</span>
                {community.description ? <span className="line-clamp-2 text-[15px] text-muted-foreground">{community.description}</span> : null}
                <span className="text-sm text-muted-foreground">
                  {formatCount(community.memberCount)} {community.memberCount === 1 ? "member" : "members"}
                </span>
              </Link>
              {community.role === "owner" ? (
                <span className="text-sm text-muted-foreground">Owner</span>
              ) : (
                <MembershipButton communityId={community.id} joined={community.role !== null} />
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
