import { notFound } from "next/navigation"
import { requireViewer } from "@/lib/auth"
import { topicFollowing } from "@/lib/data"
import { feedFor, type FeedSpec } from "@/lib/feeds"
import { normalizeTag } from "@/lib/rules"
import { FeedList } from "@/components/app/feed-list"
import { PageHeader } from "@/components/app/page-header"
import { TopicFollowButton } from "@/components/app/topic-follow-button"

type Params = Promise<{ tag: string }>

// Nothing here streams, so the empty-tag check gives a real 404 before anything is sent.
export const instant = false

export default async function TopicPage({ params }: { params: Params }) {
  const viewer = await requireViewer()
  const { tag } = await params
  const clean = normalizeTag(tag)
  if (!clean) notFound()
  const spec: FeedSpec = { kind: "topic", tag: clean }
  const page = feedFor(spec, viewer.id)
  return (
    <>
      <PageHeader title={`#${clean}`} backHref="/explore" actions={<TopicFollowButton tag={clean} following={topicFollowing(viewer.id, clean)} />} />
      <FeedList
        items={page.items}
        next={page.next}
        spec={spec}
        viewer={viewer}
        emptyTitle={`No posts about #${clean} yet`}
        emptyBody="Posts that use this hashtag show up here."
      />
    </>
  )
}
