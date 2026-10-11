import Link from "next/link"
import { EyeOff, Info, Pin, Repeat2, Sparkles } from "lucide-react"
import { Avatar } from "@/components/app/avatar"
import { VerifiedBadge } from "@/components/app/badges"
import { EditHistory } from "@/components/app/edit-history"
import { MediaGrid } from "@/components/app/media-grid"
import { PollView } from "@/components/app/poll-view"
import { PostActions } from "@/components/app/post-actions"
import { PostBody } from "@/components/app/post-body"
import { LocalTime, RelativeTime } from "@/components/app/time-text"
import { ViewBeacon } from "@/components/app/view-beacon"
import { NumberTicker } from "@/components/ui/number-ticker"
import type { MiniUser, PostCore, PostView } from "@/lib/data"
import type { Viewer } from "@/lib/auth"
import { fullTimestamp } from "@/lib/format"
import { cn } from "@/lib/utils"

function QuotedPost({ post }: { post: PostCore }) {
  return (
    <Link
      href={`/${post.author.handle}/status/${post.id}`}
      className="relative z-10 mt-2 block rounded-2xl border border-border p-3 transition-colors hover:bg-muted/40"
    >
      <p className="text-sm">
        <span className="font-semibold">{post.author.name}</span>
        {post.author.verified ? <VerifiedBadge className="ml-1 inline-block align-[-2px]" /> : null}{" "}
        <span className="text-muted-foreground">
          @{post.author.handle} · <RelativeTime at={post.createdAt} />
        </span>
      </p>
      {post.body ? <PostBody text={post.body} className="mt-1 line-clamp-6 text-[15px]" /> : null}
      {post.media.length > 0 ? (
        <p className="mt-1 text-[13px] text-muted-foreground">
          {post.media.length} {post.media[0].kind === "video" ? "video" : "photo"}
          {post.media.length > 1 ? "s" : ""}
        </p>
      ) : null}
    </Link>
  )
}

export function PostCard({
  post,
  viewer,
  repostedBy,
  detail = false,
  showPinned = false,
}: {
  post: PostView
  viewer: Viewer
  repostedBy?: MiniUser | null
  detail?: boolean
  showPinned?: boolean
}) {
  const statusHref = `/${post.author.handle}/status/${post.id}`
  const isOwn = post.author.id === viewer.id
  // The edit window is checked again on the server when the post is saved.
  // eslint-disable-next-line react-hooks/purity
  const editable = isOwn && Date.now() - post.createdAt < 30 * 60 * 1000
  return (
    <article className={cn("relative border-b border-border px-4 pt-3 pb-2 transition-colors", !detail && "hover:bg-secondary/60")}>
      <ViewBeacon postId={post.id} />
      {showPinned && post.pinned ? (
        <p className="mb-1 flex items-center gap-2 pl-12 text-[13px] text-muted-foreground">
          <Pin className="size-3.5" />
          <span>Pinned</span>
        </p>
      ) : null}
      {repostedBy ? (
        <p className="mb-1 flex items-center gap-2 pl-12 text-[13px] text-muted-foreground">
          <Repeat2 className="size-3.5" />
          <span>{repostedBy.id === viewer.id ? "You reposted" : `${repostedBy.name} reposted`}</span>
        </p>
      ) : null}
      {post.hiddenByParent ? (
        <p className="mb-1 flex items-center gap-2 pl-12 text-[13px] text-muted-foreground">
          <EyeOff className="size-3.5" />
          <span>Hidden reply</span>
        </p>
      ) : null}
      {post.highlighted && !detail && !showPinned ? (
        <p className="mb-1 flex items-center gap-2 pl-12 text-[13px] text-muted-foreground">
          <Sparkles className="size-3.5" />
          <span>Highlighted</span>
        </p>
      ) : null}
      <div className="flex gap-3">
        <Link href={`/${post.author.handle}`} className="relative z-10 shrink-0" aria-label={`${post.author.name} profile`}>
          <Avatar user={post.author} size={40} />
        </Link>
        <div className="min-w-0 flex-1">
          <header className="flex flex-wrap items-baseline gap-x-2 leading-tight">
            <Link href={`/${post.author.handle}`} className="relative z-10 inline-flex max-w-full items-center truncate font-semibold hover:underline">
              <span className="truncate">{post.author.name}</span>
              {post.author.verified ? <VerifiedBadge className="ml-1 shrink-0" /> : null}
            </Link>
            <span className="truncate text-[15px] text-muted-foreground">@{post.author.handle}</span>
            <time dateTime={new Date(post.createdAt).toISOString()} title={fullTimestamp(post.createdAt)} suppressHydrationWarning className="text-[15px] text-muted-foreground">
              <Link href={statusHref} className="transition-colors after:absolute after:inset-0 hover:text-foreground">
                <RelativeTime at={post.createdAt} />
              </Link>
            </time>
            {post.editedAt ? <EditHistory postId={post.id} /> : null}
          </header>
          {post.replyToHandle && !detail ? (
            <p className="text-[13px] text-muted-foreground">
              Replying to{" "}
              <Link href={`/${post.replyToHandle}`} className="relative z-10 text-dusk hover:underline">
                @{post.replyToHandle}
              </Link>
            </p>
          ) : null}
          {post.body ? (
            <PostBody text={post.body} className={cn("leading-relaxed", detail ? "mt-2 text-xl" : "mt-0.5 text-[15px]")} />
          ) : null}
          {post.media.length > 0 ? <MediaGrid media={post.media} sensitive={post.sensitive && !isOwn} /> : null}
          {post.poll ? <PollView postId={post.id} poll={post.poll} /> : null}
          {post.quoted ? <QuotedPost post={post.quoted} /> : null}
          {post.hasNote ? (
            <Link
              href={`${statusHref}#notes`}
              className="relative z-10 mt-2 flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <Info className="size-4 shrink-0" />
              <span>Readers added context to this post. See the community note.</span>
            </Link>
          ) : null}
          {detail ? (
            <div className="mt-3 flex flex-col gap-3 border-y border-border py-3 text-[15px]">
              <p className="text-muted-foreground">
                <LocalTime at={post.createdAt} variant="full" />
                {post.editedAt ? (
                  <>
                    {" · Edited "}
                    <LocalTime at={post.editedAt} variant="full" />
                  </>
                ) : null}
              </p>
              <div className="flex flex-wrap gap-5">
                <p>
                  <NumberTicker value={post.views} className="font-semibold text-foreground" />{" "}
                  <span className="text-muted-foreground">Views</span>
                </p>
                <p>
                  <NumberTicker value={post.reposts} className="font-semibold text-foreground" />{" "}
                  <span className="text-muted-foreground">Reposts</span>
                </p>
                <p>
                  <NumberTicker value={post.quotes} className="font-semibold text-foreground" />{" "}
                  <span className="text-muted-foreground">Quotes</span>
                </p>
                <p>
                  <NumberTicker value={post.likes} className="font-semibold text-foreground" />{" "}
                  <span className="text-muted-foreground">Likes</span>
                </p>
                {isOwn ? (
                  <Link href={`${statusHref}/analytics`} className="relative z-10 font-semibold text-foreground underline underline-offset-4 hover:text-dusk">
                    Post analytics
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}
          <PostActions
            viewer={viewer}
            postId={post.id}
            body={post.body}
            author={post.author}
            replies={post.replies}
            reposts={post.reposts}
            quotes={post.quotes}
            likes={post.likes}
            views={post.views}
            liked={post.liked}
            reposted={post.reposted}
            bookmarked={post.bookmarked}
            isOwn={isOwn}
            isRoot={post.replyToId === null}
            pinned={post.pinned}
            highlighted={post.highlighted}
            editable={editable}
            canReply={post.canReply}
            replySetting={post.replySetting}
            media={post.media}
            quoteAuthor={{ name: post.author.name, handle: post.author.handle, body: post.body }}
            canHideReply={post.canHideReply}
            hiddenByParent={post.hiddenByParent}
            redirectAfterDelete={detail ? `/${post.author.handle}` : undefined}
          />
        </div>
      </div>
    </article>
  )
}
