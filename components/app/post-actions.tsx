"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useOptimistic, useState, useTransition } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Ban, BellOff, Bookmark, Coins, Eye, EyeOff, Flag, Heart, MoreHorizontal, Pencil, Pin, PinOff, Quote, Repeat2, Share2, Sparkles, ThumbsDown, Trash2, VolumeX } from "lucide-react"
import { toast } from "sonner"
import { markNotInterested } from "@/actions/feed"
import { snoozeForYouTopic } from "@/actions/topic-snoozes"
import { extractHashtags } from "@/lib/rules"
import { deletePost, pinPost, reportPost, setReplyHidden, toggleBookmark, toggleHighlight, toggleLike, toggleRepost } from "@/actions/posts"
import { toggleBlock, toggleMute } from "@/actions/social"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { Composer } from "@/components/app/composer"
import { EditPostDialog } from "@/components/app/edit-post-dialog"
import { ShareSheet } from "@/components/app/share-sheet"
import { TipDialog } from "@/components/app/tip-dialog"
import { PostBody } from "@/components/app/post-body"
import { DIALOG_CLOSE_PHONE, DIALOG_FIT, MENU_ITEM_PHONE } from "@/components/app/overlay-sizes"
import type { AvatarUser } from "@/components/app/avatar"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import type { MediaItem, MiniUser } from "@/lib/data"
import { REPORT_REASONS, replyRefusal, type ReplySetting } from "@/lib/rules"
import { pluralize } from "@/lib/format"
import { cn } from "@/lib/utils"

type Props = {
  viewer: AvatarUser
  postId: string
  body: string
  title: string
  author: MiniUser
  replies: number
  reposts: number
  quotes: number
  likes: number
  views: number
  liked: boolean
  reposted: boolean
  bookmarked: boolean
  isOwn: boolean
  isRoot: boolean
  pinned: boolean
  highlighted: boolean
  editable: boolean
  editWindowMs: number
  tippable: boolean
  canReply: boolean
  replySetting: ReplySetting
  media: MediaItem[]
  quoteAuthor: { name: string; handle: string; body: string }
  redirectAfterDelete?: string
  canHideReply: boolean
  hiddenByParent: boolean
}

// Every control is a 40px target on a phone and tighter on a computer. On a phone the four counts spread across the row and
// the bookmark, share and more controls stay together at its right. When the counts get long, those three drop to a line
// of their own, so nothing overflows.
const BUTTON =
  "inline-flex shrink-0 items-center justify-center gap-1 rounded-full px-0.5 text-[13px] tabular-nums outline-none transition-colors duration-200 hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 max-sm:min-h-10 max-sm:min-w-10 sm:gap-1.5 sm:px-2 sm:py-1.5"

// Reply, repost and like are words with their counts, so the row reads as type. Bookmark and share sit in the ⋯ menu.
const TEXT_ACTION =
  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[14px] font-medium outline-none transition-colors duration-200 hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 max-sm:h-10"

const COMPACT = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 })

// 999 stays 999, 1,234 becomes 1.2K. Short enough that four counts and three icons fit a phone's row.
function shortCount(value: number): string {
  return value < 1000 ? String(value) : COMPACT.format(value)
}

function Count({ value }: { value: number }) {
  if (value <= 0) return null
  return (
    <span className="relative inline-flex h-4 overflow-hidden">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ y: 8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -8, opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          {shortCount(value)}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

export function PostActions(props: Props) {
  const {
    viewer,
    postId,
    author,
    replies,
    reposts,
    likes,
    views,
    liked,
    reposted,
    bookmarked,
    isOwn,
    isRoot,
    pinned,
    highlighted,
    editable,
    editWindowMs,
    tippable,
    canReply,
    replySetting,
    media,
    quoteAuthor,
    redirectAfterDelete,
    canHideReply,
    hiddenByParent,
  } = props
  const router = useRouter()
  const [, startTransition] = useTransition()
  const reduceMotion = useReducedMotion()
  // What the server last confirmed, and what the reader sees while a tap is on its way. A tap does not re-render the page
  // (that would send the whole page back), so the confirmed value lives here. It follows the props when they change.
  const [likeConfirmed, setLikeConfirmed] = useState({ active: liked, count: likes })
  const [likeState, setLikeState] = useOptimistic(likeConfirmed)
  const [repostConfirmed, setRepostConfirmed] = useState({ active: reposted, count: reposts })
  const [repostState, setRepostState] = useOptimistic(repostConfirmed)
  const [bookmarkConfirmed, setBookmarkConfirmed] = useState(bookmarked)
  const [bookmarkState, setBookmarkState] = useOptimistic(bookmarkConfirmed)
  // The props the confirmed values were taken from. When the server sends new ones, the confirmed values follow.
  const [fromProps, setFromProps] = useState({ liked, likes, reposted, reposts, bookmarked })
  if (fromProps.liked !== liked || fromProps.likes !== likes || fromProps.reposted !== reposted || fromProps.reposts !== reposts || fromProps.bookmarked !== bookmarked) {
    setFromProps({ liked, likes, reposted, reposts, bookmarked })
    setLikeConfirmed({ active: liked, count: likes })
    setRepostConfirmed({ active: reposted, count: reposts })
    setBookmarkConfirmed(bookmarked)
  }
  const [replyOpen, setReplyOpen] = useState(false)
  const [quoteOpen, setQuoteOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [tipOpen, setTipOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [reason, setReason] = useState<string>(REPORT_REASONS[0])
  const [reportPending, startReport] = useTransition()

  const statusHref = `/${author.handle}/status/${postId}`
  // Why the reply button does nothing for this reader: the same words the server gives when it refuses a reply.
  const replyReason = canReply ? null : replyRefusal(replySetting)

  // A failed tap is not confirmed, so the reader's view falls back to what the server last said once the tap ends.
  function onLike() {
    const next = { active: !likeState.active, count: likeState.count + (likeState.active ? -1 : 1) }
    startTransition(async () => {
      setLikeState(next)
      const result = await toggleLike(postId)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setLikeConfirmed((prev) => ({ active: result.active, count: prev.count + (result.active === prev.active ? 0 : result.active ? 1 : -1) }))
    })
  }

  function onRepost() {
    const next = { active: !repostState.active, count: repostState.count + (repostState.active ? -1 : 1) }
    startTransition(async () => {
      setRepostState(next)
      const result = await toggleRepost(postId)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setRepostConfirmed((prev) => ({ active: result.active, count: prev.count + (result.active === prev.active ? 0 : result.active ? 1 : -1) }))
    })
  }

  function onBookmark() {
    startTransition(async () => {
      setBookmarkState(!bookmarkState)
      const result = await toggleBookmark(postId)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setBookmarkConfirmed(result.active)
      toast.success(result.active ? "Saved to bookmarks." : "Removed from bookmarks.")
    })
  }

  function onReply() {
    if (replyReason) toast(replyReason)
    else setReplyOpen(true)
  }

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, success?: string, after?: () => void) {
    startTransition(async () => {
      const result = await action()
      if (result.ok) {
        if (success) toast.success(success)
        after?.()
      } else {
        toast.error(result.error)
      }
    })
  }

  // Mute and block flip, so the message follows what the server did and not what the menu said.
  function onMute() {
    startTransition(async () => {
      const result = await toggleMute(author.handle)
      if (!result.ok) toast.error(result.error)
      else toast.success(result.muted === false ? `Unmuted @${author.handle}.` : `Muted @${author.handle}.`)
    })
  }

  function onBlock() {
    startTransition(async () => {
      const result = await toggleBlock(author.handle)
      if (!result.ok) toast.error(result.error)
      else toast.success(result.blocked === false ? `Unblocked @${author.handle}.` : `Blocked @${author.handle}.`)
    })
  }

  function submitReport() {
    startReport(async () => {
      const result = await reportPost(postId, reason)
      if (result.ok) {
        setReportOpen(false)
        toast.success("Thanks. We'll review this post.")
      } else {
        toast.error(result.error)
      }
    })
  }

  const ownItems = isOwn
    ? [
        ...(editable
          ? [
              <DropdownMenuItem key="edit" className={MENU_ITEM_PHONE} onClick={() => setEditOpen(true)}>
                <Pencil className="size-4" /> {isRoot ? "Edit post" : "Edit reply"}
              </DropdownMenuItem>,
            ]
          : []),
        ...(isRoot
          ? [
              <DropdownMenuItem key="pin" className={MENU_ITEM_PHONE} onClick={() => run(() => pinPost(pinned ? null : postId), pinned ? "Unpinned from your profile." : "Pinned to your profile.")}>
                {pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
                {pinned ? "Unpin from profile" : "Pin to profile"}
              </DropdownMenuItem>,
            ]
          : []),
        <DropdownMenuItem key="highlight" className={MENU_ITEM_PHONE} onClick={() => run(() => toggleHighlight(postId), highlighted ? "Removed from highlights." : "Added to highlights.")}>
          <Sparkles className="size-4" />
          {highlighted ? "Remove from highlights" : "Add to highlights"}
        </DropdownMenuItem>,
        <DropdownMenuSeparator key="sep-own" />,
        <DropdownMenuItem key="delete" variant="destructive" className={MENU_ITEM_PHONE} onClick={() => setDeleteOpen(true)}>
          <Trash2 className="size-4" /> Delete post
        </DropdownMenuItem>,
      ]
    : []

  // The author of the post a reply belongs to can hide that reply, whoever wrote it.
  const replyItems =
    canHideReply
      ? [
          <DropdownMenuItem key="hide-reply" className={MENU_ITEM_PHONE} onClick={() => run(() => setReplyHidden(postId, !hiddenByParent), hiddenByParent ? "Reply unhidden." : "Reply hidden.")}>
            {hiddenByParent ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
            {hiddenByParent ? "Unhide reply" : "Hide reply"}
          </DropdownMenuItem>,
        ]
      : []

  const otherItems = !isOwn
    ? [
        ...(tippable
          ? [
              <DropdownMenuItem key="tip" className={MENU_ITEM_PHONE} onClick={() => setTipOpen(true)}>
                <Coins className="size-4" /> Tip @{author.handle}
              </DropdownMenuItem>,
            ]
          : []),
        ...extractHashtags(props.body)
          .slice(0, 2)
          .map((tag) => (
            <DropdownMenuItem
              key={`snooze-${tag}`}
              className={MENU_ITEM_PHONE}
              onClick={() =>
                run(() => snoozeForYouTopic(tag), `#${tag} is snoozed. Its posts stay out of For you for 30 days.`, () =>
                  window.dispatchEvent(new CustomEvent("rhenko:snoozed", { detail: { tag } }))
                )
              }
            >
              <BellOff className="size-4" /> Snooze #{tag} in For you
            </DropdownMenuItem>
          )),
        <DropdownMenuItem
          key="not-interested"
          className={MENU_ITEM_PHONE}
          onClick={() =>
            run(() => markNotInterested(postId), "We'll show you less like this.", () =>
              window.dispatchEvent(new CustomEvent("rhenko:hidden", { detail: { postId } }))
            )
          }
        >
          <ThumbsDown className="size-4" /> Not interested
        </DropdownMenuItem>,
        <DropdownMenuItem key="mute" className={MENU_ITEM_PHONE} onClick={onMute}>
          <VolumeX className="size-4" /> Mute @{author.handle}
        </DropdownMenuItem>,
        <DropdownMenuItem key="block" variant="destructive" className={MENU_ITEM_PHONE} onClick={onBlock}>
          <Ban className="size-4" /> Block @{author.handle}
        </DropdownMenuItem>,
        <DropdownMenuItem key="report" className={MENU_ITEM_PHONE} onClick={() => setReportOpen(true)}>
          <Flag className="size-4" /> Report post
        </DropdownMenuItem>,
      ]
    : []

  return (
    <div className="mt-2 -ml-2 flex items-center text-muted-foreground max-sm:-mr-2">
      <div className="flex min-w-0 flex-1 items-center gap-0.5 sm:flex-none">
        <button
          type="button"
          onClick={onReply}
          aria-disabled={canReply ? undefined : true}
          aria-label={`Reply, ${replies} ${pluralize(replies, "reply", "replies")}`}
          title={replyReason ?? "Reply"}
          className={cn(TEXT_ACTION, "relative z-10", !canReply && "opacity-60")}
        >
          Reply
          <Count value={replies} />
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`Repost, ${repostState.count} ${pluralize(repostState.count, "repost", "reposts")}`}
            className={cn(TEXT_ACTION, "relative z-10", repostState.active && "font-semibold text-foreground")}
          >
            Repost
            <Count value={repostState.count} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-44">
            <DropdownMenuItem className={MENU_ITEM_PHONE} onClick={onRepost}>
              <Repeat2 className="size-4" />
              {repostState.active ? "Undo repost" : "Repost"}
            </DropdownMenuItem>
            <DropdownMenuItem className={MENU_ITEM_PHONE} onClick={() => setQuoteOpen(true)}>
              <Quote className="size-4" />
              Quote post
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          type="button"
          onClick={onLike}
          aria-pressed={likeState.active}
          aria-label={likeState.active ? `Unlike, ${likeState.count} ${pluralize(likeState.count, "like")}` : `Like, ${likeState.count} ${pluralize(likeState.count, "like")}`}
          className={cn(TEXT_ACTION, "relative z-10", likeState.active && "text-destructive hover:text-destructive")}
        >
          {/* A like pops the heart out and fills it. The pop replays on each like, and an unlike just clears it. */}
          <motion.span
            key={likeState.active ? "liked" : "unliked"}
            initial={likeState.active && !reduceMotion ? { scale: 0.55 } : false}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 520, damping: 13 }}
            className="inline-flex"
          >
            <Heart size={16} className={cn(likeState.active && "fill-current")} />
          </motion.span>
          Like
          <Count value={likeState.count} />
        </button>

      </div>
      <div className="ml-auto flex items-center">
        {isOwn ? (
          // The author's view count opens the post's analytics.
          <Link
            href={`${statusHref}/analytics`}
            aria-label={`${views} ${pluralize(views, "view")}, post analytics`}
            title="Post analytics"
            className="inline-flex h-9 items-center px-2 text-[13px] tabular-nums outline-none hover:text-foreground max-sm:h-10"
          >
            {views} {pluralize(views, "view")}
          </Link>
        ) : (
          <span className="inline-flex h-9 items-center px-2 text-[13px] tabular-nums max-sm:h-10" title={`${views} ${pluralize(views, "view")}`}>
            {views} {pluralize(views, "view")}
          </span>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger aria-label="More options" className={cn(BUTTON, "relative z-10")}>
            <MoreHorizontal className="size-[18px]" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-52">
            <DropdownMenuItem className={MENU_ITEM_PHONE} onClick={onBookmark}>
              <Bookmark className={cn("size-4", bookmarkState && "fill-current")} />
              {bookmarkState ? "Remove bookmark" : "Bookmark"}
            </DropdownMenuItem>
            <DropdownMenuItem className={MENU_ITEM_PHONE} onClick={() => setShareOpen(true)}>
              <Share2 className="size-4" />
              Share
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {replyItems}
            {replyItems.length > 0 ? <DropdownMenuSeparator key="sep-reply" /> : null}
            {isOwn ? ownItems : otherItems}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={replyOpen} onOpenChange={setReplyOpen}>
        <DialogContent className={cn("sm:max-w-lg", DIALOG_CLOSE_PHONE, DIALOG_FIT)} showCloseButton>
          <DialogTitle className="text-base font-semibold">Reply</DialogTitle>
          <DialogDescription className="sr-only">Write a reply to @{author.handle}</DialogDescription>
          <Composer viewer={viewer} replyToId={postId} placeholder="Post your reply" compact autoFocus onPosted={() => setReplyOpen(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={quoteOpen} onOpenChange={setQuoteOpen}>
        <DialogContent className={cn("sm:max-w-lg", DIALOG_CLOSE_PHONE, DIALOG_FIT)} showCloseButton>
          <DialogTitle className="text-base font-semibold">Quote post</DialogTitle>
          <DialogDescription className="sr-only">Quote this post with your own words</DialogDescription>
          <Composer viewer={viewer} quoteOfId={postId} placeholder="Add a comment" compact autoFocus onPosted={() => setQuoteOpen(false)} />
          <div className="rounded-2xl border border-border p-3 text-sm">
            <p>
              <span className="font-semibold">{quoteAuthor.name}</span>
            </p>
            {quoteAuthor.body ? <PostBody text={quoteAuthor.body} className="mt-1 line-clamp-4 text-[15px]" /> : null}
          </div>
        </DialogContent>
      </Dialog>

      {!isOwn && tippable ? <TipDialog open={tipOpen} onOpenChange={setTipOpen} postId={postId} handle={author.handle} /> : null}
      {isOwn ? <EditPostDialog open={editOpen} onOpenChange={setEditOpen} postId={postId} body={props.body} title={props.title} media={media} windowMs={editWindowMs} reply={!isRoot} /> : null}

      <ShareSheet
        open={shareOpen}
        onOpenChange={setShareOpen}
        post={{ id: postId, body: props.body, author: { name: author.name, handle: author.handle, avatarFile: author.avatarFile } }}
      />

      {isOwn ? (
        <ConfirmDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title="Delete post?"
          description="This can't be undone. Replies to this post are deleted too."
          confirmLabel="Delete"
          action={() => deletePost(postId)}
          onDone={() => {
            if (redirectAfterDelete) router.push(redirectAfterDelete)
            else router.refresh()
          }}
        />
      ) : null}

      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className={cn("sm:max-w-sm", DIALOG_CLOSE_PHONE, DIALOG_FIT)} showCloseButton>
          <DialogTitle className="text-lg font-semibold">Report post</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">Why are you reporting this post?</DialogDescription>
          <fieldset className="flex flex-col gap-1">
            <legend className="sr-only">Reason</legend>
            {REPORT_REASONS.map((option) => (
              <label key={option} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 py-2.5 text-[15px] hover:bg-muted">
                <input
                  type="radio"
                  name={`report-${postId}`}
                  value={option}
                  checked={reason === option}
                  onChange={() => setReason(option)}
                  className="size-4 accent-[var(--dusk)]"
                />
                {option}
              </label>
            ))}
          </fieldset>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setReportOpen(false)} className="h-10 rounded-full px-4 sm:h-9">
              Cancel
            </Button>
            <Button type="button" disabled={reportPending} onClick={submitReport} className="h-10 rounded-full px-4 font-semibold sm:h-9">
              {reportPending ? "Sending" : "Submit"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
