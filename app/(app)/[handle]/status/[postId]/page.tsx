import { notFound, redirect } from "next/navigation"
import { requireViewer } from "@/lib/auth"
import { getPost, notesFor, repliesTo } from "@/lib/data"
import { CommunityNotes } from "@/components/app/community-notes"
import { Composer } from "@/components/app/composer"
import { FeedList } from "@/components/app/feed-list"
import { PageHeader } from "@/components/app/page-header"
import { PostCard } from "@/components/app/post-card"
import { REPLY_SETTING_LABELS } from "@/lib/rules"

type Params = Promise<{ handle: string; postId: string }>

// Existence checks run before anything streams, so a missing record gets a real 404.
export const instant = false

export default async function StatusPage({ params }: { params: Params }) {
  const { postId } = await params
  const viewer = await requireViewer()
  if (!getPost(postId, viewer.id)) notFound()
  return <StatusBody params={params} />
}

async function StatusBody({ params }: { params: Params }) {
  const viewer = await requireViewer()
  const { handle, postId } = await params
  const post = getPost(postId, viewer.id)
  if (!post) notFound()
  if (post.author.handle.toLowerCase() !== handle.toLowerCase()) {
    redirect(`/${post.author.handle}/status/${post.id}`)
  }

  const parent = post.replyToId ? getPost(post.replyToId, viewer.id) : null
  const replies = repliesTo(post.id, viewer.id)
  const items = replies.map((reply) => ({ key: `reply:${reply.id}`, sortAt: reply.createdAt, post: reply, repostedBy: null, folderId: null }))

  return (
    <>
      <PageHeader title="Post" backHref="/" />
      {parent ? <PostCard post={parent} viewer={viewer} /> : null}
      <PostCard post={post} viewer={viewer} detail />
      <CommunityNotes postId={post.id} notes={notesFor(post.id, viewer.id)} signedIn />
      {post.canReply ? (
        <Composer viewer={viewer} replyToId={post.id} id="reply" placeholder="Post your reply" compact />
      ) : (
        <p className="border-b border-border px-4 py-4 text-sm text-muted-foreground">
          {post.author.id === viewer.id
            ? `Replies: ${REPLY_SETTING_LABELS[post.replySetting]}.`
            : `@${post.author.handle} doesn't allow replies from you.`}
        </p>
      )}
      <FeedList items={items} emptyTitle="No replies yet" emptyBody="Be the first to reply." viewer={viewer} />
    </>
  )
}
