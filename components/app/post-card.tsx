import Link from "next/link"
import { CalendarClock, CircleDot, EyeOff, Info, PenLine, Pin, Repeat2, Sparkles } from "lucide-react"
import { Avatar } from "@/components/app/avatar"
import { AiLabel, SubscriberBadge, VerifiedBadge } from "@/components/app/badges"
import { ProfileLink } from "@/components/app/profile-hover"
import { EditHistory } from "@/components/app/edit-history"
import { MediaGrid } from "@/components/app/media-grid"
import { PendingActions } from "@/components/app/pending-actions"
import { PollView } from "@/components/app/poll-view"
import { PostActions } from "@/components/app/post-actions"
import { PostBody } from "@/components/app/post-body"
import { TranslateControl } from "@/components/app/translate-control"
import { LinkCard } from "@/components/app/link-card"
import { LocalTime, RelativeTime } from "@/components/app/time-text"
import { ViewBeacon } from "@/components/app/view-beacon"
import type { MiniUser, PollOption, PostCore, PostView } from "@/lib/data"
import type { Viewer } from "@/lib/auth"
import { fullTimestamp } from "@/lib/format"
import { editWindowMs } from "@/lib/rules"
import { cn } from "@/lib/utils"

// The quoted post is a box with its own link across the whole of it. The links inside the text (mentions, tags) sit above
// that link, so no anchor is ever placed inside another.
function QuotedPost({ post }: { post: PostCore }) {
  return (
    <div className="relative z-10 mt-2 rounded-2xl border border-border p-3 transition-colors hover:bg-muted/40">
      <Link
        href={`/${post.author.handle}/status/${post.id}`}
        transitionTypes={["nav-forward"]}
        aria-label={`Open ${post.author.name}'s post`}
        className="absolute inset-0 z-0 rounded-2xl"
      />
      <p className="pointer-events-none flex min-w-0 items-center gap-2 text-sm">
        <Avatar user={post.author} size={22} />
        <span className="min-w-0 truncate font-semibold">{post.author.name}</span>
        {post.author.verified ? <VerifiedBadge className="shrink-0" /> : null}
        {post.author.paidVerified ? <SubscriberBadge className="shrink-0" /> : null}
        {post.author.bot ? <AiLabel /> : null}
        <span className="shrink-0 text-muted-foreground">
          · <RelativeTime at={post.createdAt} />
        </span>
      </p>
      {post.body ? <PostBody text={post.body} className="mt-1 line-clamp-6 text-[15px]" fold={false} /> : null}
      {post.media.length > 0 ? (
        <p className="pointer-events-none mt-1 text-[13px] text-muted-foreground">
          {post.media.length} {post.media[0].kind === "video" ? "video" : "photo"}
          {post.media.length > 1 ? "s" : ""}
        </p>
      ) : null}
    </div>
  )
}

// The post being quoted is not one this reader can open: it is private, from a blocked account, or still a draft.
// The card says so and nothing more. It never carries the author, the text, the media or a link.
function UnavailableQuote() {
  return (
    <div className="mt-2 rounded-2xl border border-border bg-muted/40 px-3 py-3 text-[15px] text-muted-foreground">
      This post isn&apos;t available.
    </div>
  )
}

// A poll on a draft or scheduled post: the choices, with no way to vote. Voting opens when the post goes out.
function PendingPoll({ options }: { options: PollOption[] }) {
  return (
    <div className="mt-3 flex flex-col gap-2" role="group" aria-label="Poll">
      {options.map((option) => (
        <div key={option.id} className="flex h-11 items-center rounded-xl border border-border px-4 text-[15px] font-medium">
          <span className="truncate">{option.label}</span>
        </div>
      ))}
      <p className="text-[13px] text-muted-foreground">Voting opens when the post goes out.</p>
    </div>
  )
}

export function PostCard({
  post,
  viewer,
  repostedBy,
  detail = false,
  showPinned = false,
  draft = false,
  threadOf,
  threadLine = false,
}: {
  post: PostView
  viewer: Viewer
  repostedBy?: MiniUser | null
  detail?: boolean
  showPinned?: boolean
  // A draft or scheduled post, which has no public engagement yet. The post's own fields say the same thing,
  // so a card is treated this way wherever it is shown.
  draft?: boolean
  // The post this card's list belongs to. A reply to it doesn't need to say "Replying to" again.
  threadOf?: string
  // Draws a thin line from this card's avatar down to the next card, so a list of replies reads as one conversation.
  threadLine?: boolean
}) {
  const statusHref = `/${post.author.handle}/status/${post.id}`
  const isOwn = post.author.id === viewer.id
  const pending = draft || post.isDraft || post.publishAt !== null
  // Drafts and scheduled posts can't be edited, only published or deleted. A live post can be edited for a short while.
  // The window is checked again on the server when the post is saved.
  const editWindow = editWindowMs(viewer.plus, post.replyToId !== null)
  // eslint-disable-next-line react-hooks/purity
  const editable = isOwn && !pending && Date.now() - post.createdAt < editWindow
  return (
    // In a feed, a post that is off screen is skipped for layout and paint until it comes near the screen.
    <article className={cn("relative border-b border-border px-4 pt-3 pb-2 transition-colors", !detail && "hover:bg-secondary/60 [content-visibility:auto] [contain-intrinsic-size:auto_240px]")}>
      {pending || isOwn ? null : <ViewBeacon postId={post.id} />}
      {threadLine ? <span aria-hidden="true" className="absolute top-14 bottom-[-13px] left-[35px] z-0 w-0.5 rounded-full bg-border" /> : null}
      {pending ? (
        <p className="mb-1 flex items-center gap-2 pl-12 text-[13px] text-muted-foreground">
          {post.publishAt !== null ? <CalendarClock className="size-3.5 shrink-0" aria-hidden="true" /> : <PenLine className="size-3.5 shrink-0" aria-hidden="true" />}
          <span>
            {post.publishAt !== null ? (
              <>
                Goes out <LocalTime at={post.publishAt} variant="full" />
              </>
            ) : (
              "Draft. Only you can see it."
            )}
          </span>
        </p>
      ) : null}
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
        <ProfileLink handle={post.author.handle} from={post.id} className="relative z-10 shrink-0" label={`${post.author.name} profile`}>
          <Avatar user={post.author} size={40} />
        </ProfileLink>
        <div className="min-w-0 flex-1">
          <header className="flex min-w-0 items-baseline gap-x-2 leading-tight">
            <ProfileLink
              handle={post.author.handle}
              from={post.id}
              className="relative z-10 inline-flex max-w-full min-w-0 shrink items-center font-semibold hover:underline max-sm:after:absolute max-sm:after:-inset-x-1 max-sm:after:-inset-y-2.5"
            >
              <span className="truncate">{post.author.name}</span>
              {post.author.verified ? <VerifiedBadge className="ml-1 shrink-0" /> : null}
              {post.author.paidVerified ? <SubscriberBadge className="ml-1 shrink-0" /> : null}
              {post.author.bot ? <AiLabel /> : null}
            </ProfileLink>
            <span className="min-w-0 truncate text-[15px] text-muted-foreground">@{post.author.handle}</span>
            <time dateTime={new Date(post.createdAt).toISOString()} title={fullTimestamp(post.createdAt)} suppressHydrationWarning className="shrink-0 text-[15px] whitespace-nowrap text-muted-foreground">
              <Link href={statusHref} transitionTypes={["nav-forward"]} className="transition-colors after:absolute after:inset-0 hover:text-foreground">
                <RelativeTime at={post.createdAt} />
              </Link>
            </time>
            {post.editedAt ? <EditHistory postId={post.id} /> : null}
          </header>
          {post.replyToHandle && !detail && post.replyToId !== threadOf ? (
            <p className="text-[13px] text-muted-foreground">
              Replying to{" "}
              <Link href={`/${post.replyToHandle}`} className="relative z-10 text-foreground hover:underline">
                @{post.replyToHandle}
              </Link>
            </p>
          ) : null}
          {post.circle && !post.replyToId ? (
            <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
              <CircleDot className="size-3.5" aria-hidden="true" />
              <span>
                In{" "}
                <Link href={`/circles/${post.circle.slug}`} className="relative z-10 font-semibold text-foreground hover:underline">
                  {post.circle.name}
                </Link>
              </span>
            </p>
          ) : null}
          {post.title ? (
            <h2 className={cn("font-semibold tracking-tight text-pretty", detail ? "mt-2 text-3xl leading-tight" : "mt-0.5 text-[19px] leading-snug")}>
              {post.title}
            </h2>
          ) : null}
          {post.body ? (
            <>
              <PostBody text={post.body} className={cn("leading-relaxed", detail ? "mt-2 text-xl" : "mt-0.5 text-[15px]")} />
              <div className="relative z-10">
                <TranslateControl kind="post" id={post.id} lang={post.lang} />
              </div>
            </>
          ) : null}
          {post.madeWithAi ? (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-0.5 text-[12px] text-muted-foreground">
              <Sparkles className="size-3" aria-hidden="true" />
              Made with AI
            </p>
          ) : null}
          {post.preview && post.media.length === 0 && !post.quotedUnavailable && !post.quoted ? <LinkCard preview={post.preview} /> : null}
          {post.threadId && !detail ? (
            <Link href={`/${post.author.handle}/status/${post.threadId}`} className="relative z-10 mt-1 inline-block text-[13px] text-foreground hover:underline">
              Show this thread
            </Link>
          ) : null}
          {post.media.length > 0 ? <MediaGrid media={post.media} sensitive={post.sensitive && !isOwn} /> : null}
          {post.poll ? pending ? <PendingPoll options={post.poll.options} /> : <PollView postId={post.id} poll={post.poll} /> : null}
          {post.quotedUnavailable ? <UnavailableQuote /> : post.quoted ? <QuotedPost post={post.quoted} /> : null}
          {post.hasNote ? (
            <Link
              href={`${statusHref}#notes`}
              className="relative z-10 mt-2 flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <Info className="size-4 shrink-0" />
              <span>Readers added a note to this post. Read it below.</span>
            </Link>
          ) : null}
          {detail && !pending ? (
            <div className="mt-3 flex flex-col gap-3 border-y border-border py-3 text-[15px]">
              <p className="text-muted-foreground">
                <LocalTime at={post.createdAt} variant="full" />
                {post.editedAt ? (
                  <>
                    {" Edited "}
                    <LocalTime at={post.editedAt} variant="full" />
                  </>
                ) : null}
              </p>
              {/* The counts are already on the action row below, so the owner's analytics link is the only extra here. */}
              {isOwn ? (
                <Link
                  href={`${statusHref}/analytics`}
                  className="relative z-10 inline-flex w-fit items-center font-semibold text-foreground underline underline-offset-4 hover:text-foreground max-sm:min-h-10"
                >
                  Post analytics
                </Link>
              ) : null}
            </div>
          ) : null}
          {pending ? (
            // A draft or scheduled post has no readers yet, so what it offers is what the server allows: publish it now or delete it.
            isOwn ? (
              <PendingActions
                postId={post.id}
                mode={post.isDraft ? "draft" : "scheduled"}
                afterDelete={detail ? (post.isDraft ? "/drafts" : "/drafts?tab=scheduled") : undefined}
                className="relative z-10 mt-3 mb-1"
              />
            ) : null
          ) : (
            <PostActions
              viewer={viewer}
              postId={post.id}
              body={post.body}
              title={post.title}
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
              editWindowMs={editWindow}
              tippable={post.tippable}
              canReply={post.canReply}
              replySetting={post.replySetting}
              media={post.media}
              quoteAuthor={{ name: post.author.name, handle: post.author.handle, body: post.body }}
              canHideReply={post.canHideReply}
              hiddenByParent={post.hiddenByParent}
              redirectAfterDelete={detail ? `/${post.author.handle}` : undefined}
            />
          )}
        </div>
      </div>
    </article>
  )
}
