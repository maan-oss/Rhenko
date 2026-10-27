import { notFound } from "next/navigation"
import { requireViewer } from "@/lib/auth"
import { topicFollowing, topicSummary } from "@/lib/data"
import { feedFor, type FeedSpec } from "@/lib/feeds"
import { topicLabel } from "@/lib/rules"
import { topicFromParam } from "@/lib/social-rules"
import { formatCount, pluralize } from "@/lib/format"
import { ComposeAction } from "@/components/app/compose-action"
import { FeedList } from "@/components/app/feed-list"
import { PageHeader } from "@/components/app/page-header"
import { TopicFollowButton } from "@/components/app/topic-follow-button"

type Params = Promise<{ tag: string }>

// Nothing here streams, so the tag check gives a real 404 before anything is sent.
export const instant = false

export default async function TopicPage({ params }: { params: Params }) {
  const viewer = await requireViewer()
  // A topic is a hashtag (letters, numbers and underscores, up to 50 characters) or a cashtag ($ and up to 10 letters,
  // as /topics/%24AAPL). Anything else can't be one. A cashtag keeps its $, so it is never the page of the hashtag
  // with the same letters.
  const checked = topicFromParam((await params).tag)
  if (!checked.ok) notFound()
  const clean = checked.tag
  const label = topicLabel(clean)
  const spec: FeedSpec = { kind: "topic", tag: clean }
  const page = await feedFor(spec, viewer.id)
  const summary = await topicSummary(clean)
  return (
    <>
      <PageHeader title={label} backHref="/explore" actions={<TopicFollowButton tag={clean} following={await topicFollowing(viewer.id, clean)} />} />
      <p className="border-b border-border px-4 py-3 text-sm text-muted-foreground">
        {summary.postsThisWeek > 0 ? (
          <>
            <span className="font-semibold text-foreground tabular-nums">{formatCount(summary.postsThisWeek)}</span>{" "}
            {pluralize(summary.postsThisWeek, "post", "posts")} this week
          </>
        ) : (
          "No posts this week"
        )}
        {summary.followers > 0 ? (
          <>
            <span aria-hidden="true"> · </span>
            <span className="font-semibold text-foreground tabular-nums">{formatCount(summary.followers)}</span>{" "}
            {pluralize(summary.followers, "person follows", "people follow")} this topic
          </>
        ) : null}
      </p>
      <FeedList
        items={page.items}
        next={page.next}
        spec={spec}
        viewer={viewer}
        emptyTitle={`No posts about ${label} yet`}
        emptyBody={`Be the first. Write a post with ${label} in it and it shows up here, and in the Following feed of everyone who follows the topic.`}
        emptyAction={<ComposeAction>Write a post</ComposeAction>}
      />
    </>
  )
}
