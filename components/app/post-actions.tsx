"use client"

import { useRouter } from "next/navigation"
import { useOptimistic, useState, useTransition, type ReactNode } from "react"
import { AnimatePresence, motion } from "motion/react"
import { BookmarkIcon, HeartIcon, MessageCircleIcon } from "lucide-animated"
import { Ban, Eye, Flag, Link2, MoreHorizontal, Pencil, Pin, PinOff, Quote, Repeat2, Send, Share2, Sparkles, Trash2, VolumeX } from "lucide-react"
import { toast } from "sonner"
import { deletePost, pinPost, reportPost, toggleBookmark, toggleHighlight, toggleLike, toggleRepost } from "@/actions/posts"
import { toggleBlock, toggleMute } from "@/actions/social"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { Composer } from "@/components/app/composer"
import { EditPostDialog } from "@/components/app/edit-post-dialog"
import { ShareDialog } from "@/components/app/share-dialog"
import { PostBody } from "@/components/app/post-body"
import type { AvatarUser } from "@/components/app/avatar"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import type { MediaItem, MiniUser } from "@/lib/data"
import { REPORT_REASONS, type ReplySetting, REPLY_SETTING_LABELS } from "@/lib/rules"
import { formatCount } from "@/lib/format"
import { cn } from "@/lib/utils"

type Props = {
  viewer: AvatarUser
  postId: string
  body: string
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
  canReply: boolean
  replySetting: ReplySetting
  media: MediaItem[]
  quoteAuthor: { name: string; handle: string; body: string }
  redirectAfterDelete?: string
}

const BUTTON =
  "inline-flex items-center gap-1.5 rounded-full px-2 py-1.5 text-[13px] tabular-nums transition-colors duration-200 hover:bg-dusk/10 hover:text-dusk disabled:opacity-60"

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
          {formatCount(value)}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="relative z-10 inline-flex">
      {children}
      <span className="sr-only">{label}</span>
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
    canReply,
    replySetting,
    media,
    quoteAuthor,
    redirectAfterDelete,
  } = props
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [likeState, setLikeState] = useOptimistic({ active: liked, count: likes })
  const [repostState, setRepostState] = useOptimistic({ active: reposted, count: reposts })
  const [bookmarkState, setBookmarkState] = useOptimistic(bookmarked)
  const [replyOpen, setReplyOpen] = useState(false)
  const [quoteOpen, setQuoteOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [reason, setReason] = useState<string>(REPORT_REASONS[0])
  const [reportPending, startReport] = useTransition()

  const statusHref = `/${author.handle}/status/${postId}`

  function onLike() {
    startTransition(async () => {
      setLikeState({ active: !likeState.active, count: likeState.count + (likeState.active ? -1 : 1) })
      const result = await toggleLike(postId)
      if (!result.ok) toast.error(result.error)
    })
  }

  function onRepost() {
    startTransition(async () => {
      setRepostState({ active: !repostState.active, count: repostState.count + (repostState.active ? -1 : 1) })
      const result = await toggleRepost(postId)
      if (!result.ok) toast.error(result.error)
    })
  }

  function onBookmark() {
    startTransition(async () => {
      setBookmarkState(!bookmarkState)
      const result = await toggleBookmark(postId)
      if (!result.ok) toast.error(result.error)
      else toast.success(result.active ? "Saved to bookmarks." : "Removed from bookmarks.")
    })
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

  function copyLink() {
    const url = `${window.location.origin}${statusHref}`
    navigator.clipboard?.writeText(url).then(
      () => toast.success("Link copied."),
      () => toast.error("Couldn't copy the link.")
    )
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
              <DropdownMenuItem key="edit" onClick={() => setEditOpen(true)}>
                <Pencil className="size-4" /> Edit post
              </DropdownMenuItem>,
            ]
          : []),
        ...(isRoot
          ? [
              <DropdownMenuItem key="pin" onClick={() => run(() => pinPost(pinned ? null : postId), pinned ? "Unpinned from your profile." : "Pinned to your profile.")}>
                {pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
                {pinned ? "Unpin from profile" : "Pin to profile"}
              </DropdownMenuItem>,
            ]
          : []),
        <DropdownMenuItem key="highlight" onClick={() => run(() => toggleHighlight(postId), highlighted ? "Removed from highlights." : "Added to highlights.")}>
          <Sparkles className="size-4" />
          {highlighted ? "Remove from highlights" : "Add to highlights"}
        </DropdownMenuItem>,
        <DropdownMenuSeparator key="sep-own" />,
        <DropdownMenuItem key="delete" variant="destructive" onClick={() => setDeleteOpen(true)}>
          <Trash2 className="size-4" /> Delete post
        </DropdownMenuItem>,
      ]
    : []

  const otherItems = !isOwn
    ? [
        <DropdownMenuItem key="mute" onClick={() => run(() => toggleMute(author.handle), `Muted @${author.handle}.`)}>
          <VolumeX className="size-4" /> Mute @{author.handle}
        </DropdownMenuItem>,
        <DropdownMenuItem key="block" variant="destructive" onClick={() => run(() => toggleBlock(author.handle), `Blocked @${author.handle}.`)}>
          <Ban className="size-4" /> Block @{author.handle}
        </DropdownMenuItem>,
        <DropdownMenuItem key="report" onClick={() => setReportOpen(true)}>
          <Flag className="size-4" /> Report post
        </DropdownMenuItem>,
      ]
    : []

  return (
    <div className="mt-2 -ml-2 flex items-center gap-1 text-muted-foreground">
      <Labelled label={`${replies} replies`}>
        <button
          type="button"
          onClick={() => setReplyOpen(true)}
          disabled={!canReply}
          title={canReply ? "Reply" : REPLY_SETTING_LABELS[replySetting]}
          className={cn(BUTTON, "group")}
        >
          <MessageCircleIcon size={18} className="transition-none" />
          <Count value={replies} />
        </button>
      </Labelled>

      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Repost, ${repostState.count} reposts`}
          className={cn(BUTTON, "relative z-10", repostState.active && "text-emerald-500 hover:text-emerald-500")}
        >
          <Repeat2 className="size-[18px]" />
          <Count value={repostState.count} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-44">
          <DropdownMenuItem onClick={onRepost}>
            <Repeat2 className="size-4" />
            {repostState.active ? "Undo repost" : "Repost"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setQuoteOpen(true)}>
            <Quote className="size-4" />
            Quote post
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <button
        type="button"
        onClick={onLike}
        aria-pressed={likeState.active}
        aria-label={likeState.active ? `Unlike, ${likeState.count} likes` : `Like, ${likeState.count} likes`}
        className={cn(BUTTON, "relative z-10", likeState.active && "text-destructive hover:text-destructive")}
      >
        <HeartIcon size={18} className="transition-none" />
        <Count value={likeState.count} />
      </button>

      <span className="inline-flex items-center gap-1.5 px-2 py-1.5 text-[13px] tabular-nums" aria-label={`${views} views`} title={`${views} views`}>
        <Eye className="size-[18px]" />
        <Count value={views} />
      </span>

      <button
        type="button"
        onClick={onBookmark}
        aria-pressed={bookmarkState}
        aria-label={bookmarkState ? "Remove bookmark" : "Bookmark"}
        className={cn(BUTTON, "relative z-10 ml-auto", bookmarkState && "text-dusk")}
      >
        <BookmarkIcon size={18} className="transition-none" />
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger aria-label="Share" className={cn(BUTTON, "relative z-10")}>
          <Share2 className="size-[18px]" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          <DropdownMenuItem onClick={copyLink}>
            <Link2 className="size-4" /> Copy link
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShareOpen(true)}>
            <Send className="size-4" /> Send in a message
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {ownItems.length > 0 || otherItems.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger aria-label="More options" className={cn(BUTTON, "relative z-10")}>
            <MoreHorizontal className="size-[18px]" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-52">
            {isOwn ? ownItems : otherItems}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      <Dialog open={replyOpen} onOpenChange={setReplyOpen}>
        <DialogContent className="sm:max-w-lg" showCloseButton>
          <DialogTitle className="text-base font-semibold">Reply</DialogTitle>
          <DialogDescription className="sr-only">Write a reply to @{author.handle}</DialogDescription>
          <Composer
            viewer={viewer}
            replyToId={postId}
            placeholder="Post your reply"
            compact
            autoFocus
            onPosted={() => setReplyOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={quoteOpen} onOpenChange={setQuoteOpen}>
        <DialogContent className="sm:max-w-lg" showCloseButton>
          <DialogTitle className="text-base font-semibold">Quote post</DialogTitle>
          <DialogDescription className="sr-only">Quote this post with your own words</DialogDescription>
          <Composer viewer={viewer} quoteOfId={postId} placeholder="Add a comment" compact autoFocus onPosted={() => setQuoteOpen(false)} />
          <div className="rounded-2xl border border-border p-3 text-sm">
            <p>
              <span className="font-semibold">{quoteAuthor.name}</span>{" "}
              <span className="text-muted-foreground">@{quoteAuthor.handle}</span>
            </p>
            {quoteAuthor.body ? <PostBody text={quoteAuthor.body} className="mt-1 line-clamp-4 text-[15px]" /> : null}
          </div>
        </DialogContent>
      </Dialog>

      {isOwn ? <EditPostDialog open={editOpen} onOpenChange={setEditOpen} postId={postId} body={props.body} media={media} /> : null}

      <ShareDialog open={shareOpen} onOpenChange={setShareOpen} postId={postId} />

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
        <DialogContent className="sm:max-w-sm" showCloseButton>
          <DialogTitle className="text-lg font-semibold">Report post</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">Why are you reporting this post?</DialogDescription>
          <fieldset className="flex flex-col gap-1">
            <legend className="sr-only">Reason</legend>
            {REPORT_REASONS.map((option) => (
              <label key={option} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2.5 text-[15px] hover:bg-muted">
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
            <Button type="button" variant="outline" onClick={() => setReportOpen(false)} className="h-9 rounded-full px-4">
              Cancel
            </Button>
            <Button type="button" disabled={reportPending} onClick={submitReport} className="h-9 rounded-full px-4 font-semibold">
              {reportPending ? "Sending" : "Submit"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
