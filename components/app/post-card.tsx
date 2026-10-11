import Link from "next/link"
import { Repeat2 } from "lucide-react"
import { Avatar } from "@/components/app/avatar"
import { PostActions } from "@/components/app/post-actions"
import { PostBody } from "@/components/app/post-body"
import { NumberTicker } from "@/components/ui/number-ticker"
import type { MiniUser, PostCore, PostView } from "@/lib/data"
import type { Viewer } from "@/lib/auth"
import { fullTimestamp, timeAgo } from "@/lib/format"
import { cn } from "@/lib/utils"

function QuotedPost({ post }: { post: PostCore }) {
  return (
    <div className="relative z-10 mt-2 rounded-2xl border border-border p-3 transition-colors hover:bg-muted/40">
      <p className="text-sm">
        <Link href={`/${post.author.handle}`} className="font-semibold hover:underline">
          {post.author.name}
        </Link>{" "}
        <span className="text-muted-foreground">
          @{post.author.handle} · {timeAgo(post.createdAt)}
        </span>
      </p>
      {post.body ? <PostBody text={post.body} className="mt-1 line-clamp-6 text-[15px]" /> : null}
      {post.media ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/media/${post.media}`} alt="" loading="lazy" className="mt-2 max-h-48 w-full rounded-xl border border-border object-cover" />
      ) : null}
    </div>
  )
}

export function PostCard({
  post,
  viewer,
  repostedBy,
  detail = false,
}: {
  post: PostView
  viewer: Viewer
  repostedBy?: MiniUser | null
  detail?: boolean
}) {
  const statusHref = `/${post.author.handle}/status/${post.id}`
  return (
    <article className={cn("relative border-b border-border px-4 pt-3 pb-2 transition-colors", !detail && "hover:bg-secondary/60")}>
      {repostedBy ? (
        <p className="mb-1 flex items-center gap-2 pl-12 text-[13px] text-muted-foreground">
          <Repeat2 className="size-3.5" />
          <span>{repostedBy.id === viewer.id ? "You reposted" : `${repostedBy.name} reposted`}</span>
        </p>
      ) : null}
      <div className="flex gap-3">
        <Link href={`/${post.author.handle}`} className="relative z-10 shrink-0" aria-label={`${post.author.name} profile`}>
          <Avatar user={post.author} size={40} />
        </Link>
        <div className="min-w-0 flex-1">
          <header className="flex flex-wrap items-baseline gap-x-2 leading-tight">
            <Link href={`/${post.author.handle}`} className="relative z-10 max-w-full truncate font-semibold hover:underline">
              {post.author.name}
            </Link>
            <span className="truncate text-[15px] text-muted-foreground">@{post.author.handle}</span>
            <time dateTime={new Date(post.createdAt).toISOString()} title={fullTimestamp(post.createdAt)} className="text-[15px] text-muted-foreground">
              <Link href={statusHref} className="transition-colors after:absolute after:inset-0 hover:text-foreground">
                {timeAgo(post.createdAt)}
              </Link>
            </time>
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
          {post.media ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/media/${post.media}`}
              alt=""
              loading="lazy"
              className="mt-2 max-h-[420px] w-full rounded-2xl border border-border object-cover"
            />
          ) : null}
          {post.quoted ? <QuotedPost post={post.quoted} /> : null}
          {detail ? (
            <div className="mt-3 flex flex-col gap-3 border-y border-border py-3 text-[15px]">
              <p className="text-muted-foreground">{fullTimestamp(post.createdAt)}</p>
              <div className="flex gap-5">
                <p>
                  <NumberTicker value={post.reposts} className="font-semibold text-foreground" /> <span className="text-muted-foreground">Reposts</span>
                </p>
                <p>
                  <NumberTicker value={post.quotes} className="font-semibold text-foreground" /> <span className="text-muted-foreground">Quotes</span>
                </p>
                <p>
                  <NumberTicker value={post.likes} className="font-semibold text-foreground" /> <span className="text-muted-foreground">Likes</span>
                </p>
              </div>
            </div>
          ) : null}
          <PostActions
            viewer={viewer}
            postId={post.id}
            handle={post.author.handle}
            replies={post.replies}
            reposts={post.reposts}
            quotes={post.quotes}
            likes={post.likes}
            liked={post.liked}
            reposted={post.reposted}
            bookmarked={post.bookmarked}
            isOwn={post.author.id === viewer.id}
            quoteAuthor={{ name: post.author.name, handle: post.author.handle, body: post.body }}
            redirectAfterDelete={detail ? `/${post.author.handle}` : undefined}
          />
        </div>
      </div>
    </article>
  )
}
