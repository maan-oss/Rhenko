import { notFound } from "next/navigation"
import { requireViewer } from "@/lib/auth"
import { topicFollowing } from "@/lib/data"
import { feedFor, type FeedSpec } from "@/lib/feeds"
import { topicFromParam } from "@/lib/social-rules"
import { ComposeAction } from "@/components/app/compose-action"
import { FeedList } from "@/components/app/feed-list"
import { PageHeader } from "@/components/app/page-header"
import { TopicFollowButton } from "@/components/app/topic-follow-button"

type Params = Promise<{ tag: string }>

// Nothing here streams, so the tag check gives a real 404 before anything is sent.
export const instant = false

export default async function TopicPage({ params }: { params: Params }) {
  const viewer = await requireViewer()
  // A topic is a hashtag: letters, numbers and underscores, up to 50 characters. Anything else can't be one.
  const checked = topicFromParam((await params).tag)
  if (!checked.ok) notFound()
  const clean = checked.tag
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
        emptyBody={`Be the first. Write a post with #${clean} in it and it shows up here, and in the Following feed of everyone who follows the topic.`}
        emptyAction={<ComposeAction>Write a post</ComposeAction>}
      />
    </>
  )
}
