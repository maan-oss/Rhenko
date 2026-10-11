import { notFound } from "next/navigation"
import { requireViewer } from "@/lib/auth"
import { communityDetail } from "@/lib/data"
import { feedFor, type FeedSpec } from "@/lib/feeds"
import { Composer } from "@/components/app/composer"
import { DeleteCommunityButton, MembershipButton } from "@/components/app/community-controls"
import { FeedList } from "@/components/app/feed-list"
import { PageHeader } from "@/components/app/page-header"
import { formatCount } from "@/lib/format"

type Params = Promise<{ id: string }>

// Existence checks run before anything streams, so a missing record gets a real 404.
export const instant = false

export default async function CommunityPage({ params }: { params: Params }) {
  const viewer = await requireViewer()
  if (!communityDetail((await params).id, viewer.id)) notFound()
  return <CommunityBody params={params} />
}

async function CommunityBody({ params }: { params: Params }) {
  const viewer = await requireViewer()
  const { id } = await params
  const community = communityDetail(id, viewer.id)
  if (!community) notFound()
  const joined = community.role !== null
  const spec: FeedSpec = { kind: "community", communityId: community.id }
  const page = feedFor(spec, viewer.id)

  return (
    <>
      <PageHeader title={community.name} backHref="/communities" />
      <div className="flex flex-col gap-3 border-b border-border px-4 py-4">
        {community.description ? <p className="text-[15px] leading-relaxed">{community.description}</p> : null}
        <p className="text-sm text-muted-foreground">
          {formatCount(community.memberCount)} {community.memberCount === 1 ? "member" : "members"}
          {community.role === "owner" ? " · You own this community" : null}
        </p>
        <div className="flex flex-wrap gap-2">
          {community.role === "owner" ? (
            <DeleteCommunityButton communityId={community.id} />
          ) : (
            <MembershipButton communityId={community.id} joined={joined} />
          )}
        </div>
      </div>
      {joined ? (
        <Composer viewer={viewer} communityId={community.id} communityName={community.name} placeholder={`Post to ${community.name}`} id="community-compose" />
      ) : (
        <p className="border-b border-border px-4 py-4 text-sm text-muted-foreground">Join this community to post in it.</p>
      )}
      <FeedList
        items={page.items}
        next={page.next}
        spec={spec}
        viewer={viewer}
        emptyTitle="No posts yet"
        emptyBody={joined ? "Be the first to post here." : "Posts from members show up here."}
      />
    </>
  )
}
