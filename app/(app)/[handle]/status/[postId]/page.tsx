import { Suspense } from "react"
import { notFound, redirect } from "next/navigation"
import { requireViewer } from "@/lib/auth"
import { getPost, repliesTo } from "@/lib/data"
import { Composer } from "@/components/app/composer"
import { FeedList } from "@/components/app/feed-list"
import { PageHeader } from "@/components/app/page-header"
import { PostCard } from "@/components/app/post-card"

type Params = Promise<{ handle: string; postId: string }>

export default function StatusPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={null}>
      <StatusBody params={params} />
    </Suspense>
  )
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

  return (
    <>
      <PageHeader title="Post" backHref="/" />
      {parent ? <PostCard post={parent} viewer={viewer} /> : null}
      <PostCard post={post} viewer={viewer} detail />
      <Composer viewer={viewer} replyToId={post.id} id="reply" placeholder="Post your reply" />
      <FeedList
        items={replies.map((reply) => ({ key: reply.id, sortAt: reply.createdAt, post: reply, repostedBy: null }))}
        viewer={viewer}
        emptyTitle="No replies yet"
        emptyBody="Be the first to reply."
      />
    </>
  )
}
