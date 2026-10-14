import { notFound, redirect } from "next/navigation"
import { requireViewer } from "@/lib/auth"
import { canSeePost, getPost, notesFor, repliesTo } from "@/lib/data"
import { CommunityNotes } from "@/components/app/community-notes"
import { Composer } from "@/components/app/composer"
import { FeedList } from "@/components/app/feed-list"
import { PageHeader } from "@/components/app/page-header"
import { PostCard } from "@/components/app/post-card"
import { replyRefusal } from "@/lib/rules"

type Params = Promise<{ handle: string; postId: string }>

// Existence checks run before anything streams, so a missing record gets a real 404.
export const instant = false

// A post opens only for someone who may see it. Anyone else gets the same page as a missing post.
export default async function StatusPage({ params }: { params: Params }) {
  const { postId } = await params
  const viewer = await requireViewer()
  if (!canSeePost(postId, viewer.id)) notFound()
  return <StatusBody params={params} />
}

async function StatusBody({ params }: { params: Params }) {
  const viewer = await requireViewer()
  const { handle, postId } = await params
  const post = canSeePost(postId, viewer.id) ? getPost(postId, viewer.id) : null
  if (!post) notFound()
  if (post.author.handle.toLowerCase() !== handle.toLowerCase()) {
    redirect(`/${post.author.handle}/status/${post.id}`)
  }

  // The post this one answers shows above it when the viewer may see it, and otherwise says it isn't available.
  const parent = post.replyToId ? getPost(post.replyToId, viewer.id) : null
  // A draft or scheduled post is its author's alone until it goes out, so it has no notes or replies yet.
  const live = !post.isDraft && post.publishAt === null
  const items = live
    ? repliesTo(post.id, viewer.id).map((reply) => ({ key: `reply:${reply.id}`, sortAt: reply.createdAt, post: reply, repostedBy: null, folderId: null }))
    : []

  return (
    <>
      <PageHeader title="Post" backHref="/" />
      {parent ? (
        <PostCard post={parent} viewer={viewer} />
      ) : post.replyToId ? (
        <p className="border-b border-border px-4 py-4 text-sm text-muted-foreground">This post is unavailable.</p>
      ) : null}
      <PostCard post={post} viewer={viewer} detail={live} draft={!live} />
      {live ? (
        <>
          <CommunityNotes postId={post.id} notes={notesFor(post.id, viewer.id)} signedIn />
          {post.canReply ? (
            <div className="border-b border-border px-4 py-3">
              <Composer viewer={viewer} replyToId={post.id} id="reply" placeholder="Post your reply" compact />
            </div>
          ) : (
            <p className="border-b border-border px-4 py-4 text-sm text-muted-foreground">{replyRefusal(post.replySetting)}</p>
          )}
          <FeedList items={items} emptyTitle="No replies yet" emptyBody="Be the first to reply." viewer={viewer} threadOf={post.id} />
        </>
      ) : null}
    </>
  )
}
