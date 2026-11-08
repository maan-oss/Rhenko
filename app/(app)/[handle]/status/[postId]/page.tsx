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
type SearchParams = Promise<{ tip?: string | string[] }>

// Existence checks run before anything streams, so a missing record gets a real 404.
export const instant = false

// A post opens only for someone who may see it. Anyone else gets the same page as a missing post.
export default async function StatusPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { postId } = await params
  const viewer = await requireViewer()
  if (!await canSeePost(postId, viewer.id)) notFound()
  const { tip } = await searchParams
  return <StatusBody params={params} tipped={tip === "thanks"} />
}

async function StatusBody({ params, tipped }: { params: Params; tipped: boolean }) {
  const viewer = await requireViewer()
  const { handle, postId } = await params
  const post = await canSeePost(postId, viewer.id) ? await getPost(postId, viewer.id) : null
  if (!post) notFound()
  if (post.author.handle.toLowerCase() !== handle.toLowerCase()) {
    redirect(`/${post.author.handle}/status/${post.id}`)
  }

  // The post this one answers shows above it when the viewer may see it, and otherwise says it isn't available.
  const parent = post.replyToId ? await getPost(post.replyToId, viewer.id) : null
  // A draft or scheduled post is its author's alone until it goes out, so it has no notes or replies yet.
  const live = !post.isDraft && post.publishAt === null
  const items = live
    ? (await repliesTo(post.id, viewer.id)).map((reply) => ({ key: `reply:${reply.id}`, sortAt: reply.createdAt, post: reply, repostedBy: null, folderId: null }))
    : []

  return (
    <>
      <PageHeader title="Post" backHref="/" />
      {tipped ? (
        <p role="status" className="border-b border-border px-4 py-3 text-[15px]">
          Thanks for the tip! It&apos;s on its way to @{handle}.
        </p>
      ) : null}
      {parent ? (
        <PostCard post={parent} viewer={viewer} />
      ) : post.replyToId ? (
        <p className="border-b border-border px-4 py-4 text-sm text-muted-foreground">This post is unavailable.</p>
      ) : null}
      <PostCard post={post} viewer={viewer} detail={live} draft={!live} />
      {live ? (
        <>
          <CommunityNotes postId={post.id} notes={await notesFor(post.id, viewer.id)} signedIn />
          {post.canReply ? (
            <div className="border-b border-border px-4 py-3">
              <Composer viewer={viewer} replyToId={post.id} id="reply" placeholder="Post your reply" compact />
            </div>
          ) : (
            <p className="border-b border-border px-4 py-4 text-sm text-muted-foreground">{replyRefusal(post.replySetting)}</p>
          )}
          <FeedList items={items} emptyTitle="No replies yet" emptyBody="Be the first to reply." viewer={viewer} threadOf={post.id} compactEmpty />
        </>
      ) : null}
    </>
  )
}
