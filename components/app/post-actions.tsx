"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useOptimistic, useRef, useState, useTransition, type ReactNode } from "react"
import { motion, AnimatePresence } from "motion/react"
import { BookmarkIcon, HeartIcon, MessageCircleIcon } from "lucide-animated"
import { Quote, Repeat2, Share, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { deletePost, toggleBookmark, toggleLike, toggleRepost } from "@/actions/posts"
import { Composer } from "@/components/app/composer"
import { PostBody } from "@/components/app/post-body"
import type { AvatarUser } from "@/components/app/avatar"
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { formatCount } from "@/lib/format"

type AnimatedIcon = { startAnimation: () => void; stopAnimation: () => void }

type Props = {
  viewer: AvatarUser
  postId: string
  handle: string
  replies: number
  reposts: number
  quotes: number
  likes: number
  liked: boolean
  reposted: boolean
  bookmarked: boolean
  isOwn: boolean
  quoteAuthor: { name: string; handle: string; body: string }
  redirectAfterDelete?: string
}

const CLASSES =
  "inline-flex items-center gap-1.5 rounded-full px-2 py-1.5 text-[13px] tabular-nums transition-colors duration-200 hover:bg-dusk/10 hover:text-dusk"

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

function ActionButton({
  label,
  active,
  onClick,
  children,
  activeClass = "text-dusk",
}: {
  label: string
  active?: boolean
  onClick: () => void
  children: ReactNode
  activeClass?: string
}) {
  return (
    <button type="button" onClick={onClick} aria-label={label} aria-pressed={active} className={cn(CLASSES, active && activeClass)}>
      {children}
    </button>
  )
}

function countUpdate(current: { active: boolean; count: number }, next: boolean) {
  return { active: next, count: Math.max(0, current.count + (next ? 1 : -1)) }
}

export function PostActions(props: Props) {
  const { viewer, postId, handle, isOwn, redirectAfterDelete } = props
  const router = useRouter()
  const [, startTransition] = useTransition()
  const likeIcon = useRef<AnimatedIcon | null>(null)
  const [quoteOpen, setQuoteOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [deleted, setDeleted] = useState(false)

  const [like, setLike] = useOptimistic({ active: props.liked, count: props.likes }, countUpdate)
  const [repost, setRepost] = useOptimistic({ active: props.reposted, count: props.reposts }, countUpdate)
  const [bookmark, setBookmark] = useOptimistic(props.bookmarked, (_current, next: boolean) => next)

  function onLike() {
    const next = !like.active
    likeIcon.current?.startAnimation()
    startTransition(async () => {
      setLike(next)
      const result = await toggleLike(postId)
      if (!result.ok) toast.error(result.error)
    })
  }

  function onRepost() {
    const next = !repost.active
    startTransition(async () => {
      setRepost(next)
      const result = await toggleRepost(postId)
      if (!result.ok) toast.error(result.error)
      else toast.success(result.active ? "Reposted." : "Repost removed.")
    })
  }

  function onBookmark() {
    const next = !bookmark
    startTransition(async () => {
      setBookmark(next)
      const result = await toggleBookmark(postId)
      if (!result.ok) toast.error(result.error)
      else toast.success(result.active ? "Saved to bookmarks." : "Removed from bookmarks.")
    })
  }

  function onShare() {
    const url = `${window.location.origin}/${handle}/status/${postId}`
    navigator.clipboard.writeText(url).then(
      () => toast.success("Link copied."),
      () => toast.error("Could not copy the link.")
    )
  }

  function onDelete() {
    if (!confirming) {
      setConfirming(true)
      window.setTimeout(() => setConfirming(false), 4000)
      return
    }
    startTransition(async () => {
      const result = await deletePost(postId)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setDeleted(true)
      toast.success("Post deleted.")
      if (redirectAfterDelete) router.push(redirectAfterDelete)
    })
  }

  if (deleted) return null

  return (
    <div className="relative z-10 -ml-2 mt-1 flex items-center justify-between text-muted-foreground">
      <Link href={`/${handle}/status/${postId}#reply`} aria-label="Reply" className={CLASSES}>
        <MessageCircleIcon size={18} />
        <Count value={props.replies} />
      </Link>

      <ActionButton label={repost.active ? "Undo repost" : "Repost"} active={repost.active} onClick={onRepost}>
        <Repeat2 className="size-[18px]" />
        <Count value={repost.count} />
      </ActionButton>

      <Dialog open={quoteOpen} onOpenChange={setQuoteOpen}>
        <DialogTrigger
          render={<button type="button" aria-label="Quote post" className={CLASSES} />}
        >
          <Quote className="size-[18px]" />
          <Count value={props.quotes} />
        </DialogTrigger>
        <DialogContent className="gap-3 p-0 sm:max-w-lg" showCloseButton>
          <DialogTitle className="px-4 pt-4 text-base font-semibold">Quote post</DialogTitle>
          <div className="px-4">
            <Composer
              viewer={viewer}
              quoteOfId={postId}
              placeholder="Add a comment"
              compact
              autoFocus
              onPosted={() => setQuoteOpen(false)}
            />
          </div>
          <div className="mx-4 mb-4 border border-border p-3">
            <p className="text-sm">
              <span className="font-semibold">{props.quoteAuthor.name}</span>{" "}
              <span className="text-muted-foreground">@{props.quoteAuthor.handle}</span>
            </p>
            <PostBody text={props.quoteAuthor.body} className="mt-1 line-clamp-4 text-sm" />
          </div>
        </DialogContent>
      </Dialog>

      <ActionButton label={like.active ? "Unlike" : "Like"} active={like.active} onClick={onLike} activeClass="text-destructive">
        <HeartIcon ref={likeIcon} size={18} className={cn(like.active && "[&_svg]:fill-current")} />
        <Count value={like.count} />
      </ActionButton>

      <ActionButton label={bookmark ? "Remove bookmark" : "Bookmark"} active={bookmark} onClick={onBookmark}>
        <BookmarkIcon size={18} className={cn(bookmark && "[&_svg]:fill-current")} />
      </ActionButton>

      <ActionButton label="Share post" onClick={onShare} activeClass="">
        <Share className="size-[18px]" />
      </ActionButton>

      {isOwn ? (
        <ActionButton label={confirming ? "Confirm delete" : "Delete post"} active={confirming} onClick={onDelete} activeClass="text-destructive">
          <Trash2 className="size-[18px]" />
          {confirming ? <span className="text-xs">Confirm</span> : null}
        </ActionButton>
      ) : null}
    </div>
  )
}
