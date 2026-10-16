"use client"

import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { AtSign, BellRing, Heart, ListChecks, MessageCircle, Quote, Repeat2, UserPlus, UserRound } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Avatar } from "@/components/app/avatar"
import { RelativeTime } from "@/components/app/time-text"
import type { NotificationKind, NotificationPage, NotificationView } from "@/lib/data"
import type { NotificationTab } from "@/lib/rules"
import { cn } from "@/lib/utils"
import { loadMoreNotifications } from "./actions"

const COPY: Record<NotificationKind, { text: string; Icon: LucideIcon }> = {
  like: { text: "liked your post", Icon: Heart },
  repost: { text: "reposted your post", Icon: Repeat2 },
  reply: { text: "replied to you", Icon: MessageCircle },
  quote: { text: "quoted your post", Icon: Quote },
  follow: { text: "followed you", Icon: UserPlus },
  mention: { text: "mentioned you", Icon: AtSign },
  follow_request: { text: "asked to follow you", Icon: UserRound },
  poll: { text: "A poll you voted in has ended", Icon: ListChecks },
  post: { text: "posted", Icon: BellRing },
}

const EMPTY: Record<NotificationTab, { title: string; body: string }> = {
  all: { title: "Nothing here yet", body: "Likes, replies, reposts and follows from other people show up here." },
  mentions: { title: "No mentions yet", body: "Likes, replies, reposts and follows from other people show up here." },
  priority: {
    title: "Nothing from priority accounts yet",
    body: "Pick accounts in Settings, under Notifications. Their likes, replies, posts and follows show up here.",
  },
}

type Props = { initial: NotificationPage; tab: NotificationTab; viewerHandle: string }

// Notifications, newest first. "Show more" at the end, or scrolling close to it, loads the next 40 older ones.
export function NotificationList({ initial, tab, viewerHandle }: Props) {
  const [items, setItems] = useState(initial.items)
  const [next, setNext] = useState(initial.next)
  const [failed, setFailed] = useState<string | null>(null)
  const [loading, startLoading] = useTransition()
  const busy = useRef(false)
  const sentinel = useRef<HTMLDivElement>(null)

  // A server refresh (marking them read, a new notification arriving) replaces the first page.
  const [seed, setSeed] = useState(initial)
  if (seed !== initial) {
    setSeed(initial)
    setItems(initial.items)
    setNext(initial.next)
    setFailed(null)
  }

  const loadMore = useCallback(() => {
    if (next === null || busy.current) return
    busy.current = true
    startLoading(async () => {
      try {
        const result = await loadMoreNotifications(tab, next)
        if (!result.ok) {
          setFailed(result.error)
          return
        }
        setFailed(null)
        setItems((current) => {
          const seen = new Set(current.map((item) => item.id))
          return [...current, ...result.items.filter((item) => !seen.has(item.id))]
        })
        setNext(result.next)
      } catch {
        setFailed("Couldn't load more notifications. Check your connection and try again.")
      } finally {
        busy.current = false
      }
    })
  }, [next, tab])

  useEffect(() => {
    const element = sentinel.current
    if (!element || next === null || typeof IntersectionObserver === "undefined") return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore()
      },
      { rootMargin: "600px 0px" }
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [next, loadMore])

  if (items.length === 0 && next === null) {
    const empty = EMPTY[tab]
    return (
      <div className="flex flex-col items-center gap-1.5 px-6 pt-14 pb-16 text-center">
        <p className="text-lg font-semibold">{empty.title}</p>
        <p className="max-w-sm text-muted-foreground">{empty.body}</p>
      </div>
    )
  }

  return (
    <>
      <ul className="list-none">
        {items.map((note) => (
          <NoteRow key={note.id} note={note} viewerHandle={viewerHandle} />
        ))}
      </ul>
      {next !== null ? (
        <div ref={sentinel} className="flex flex-col items-center gap-2 px-4 py-8">
          <button
            type="button"
            onClick={loadMore}
            disabled={loading}
            className="h-9 rounded-full border border-border px-5 text-sm font-semibold transition-colors hover:bg-muted disabled:opacity-60"
          >
            {loading ? "Loading" : "Show more"}
          </button>
          {failed ? <p className="text-sm text-destructive">{failed}</p> : null}
        </div>
      ) : null}
    </>
  )
}

function NoteRow({ note, viewerHandle }: { note: NotificationView; viewerHandle: string }) {
  const { text, Icon } = COPY[note.kind]
  // Likes and reposts point at your own post. Replies, quotes, mentions, new posts and poll results point at the
  // other person's. A post hidden from you leaves no preview, and the row opens their profile instead.
  const ownPost = note.kind === "like" || note.kind === "repost"
  const href =
    note.post && note.kind !== "follow" && note.kind !== "follow_request"
      ? `/${ownPost ? viewerHandle : note.actor.handle}/status/${note.post.id}`
      : `/${note.actor.handle}`
  const showActor = note.kind !== "poll"
  return (
    <li className="border-b border-border">
      <Link
        href={href}
        className={cn("flex gap-3 px-4 py-3.5 transition-colors duration-200 hover:bg-muted/60", !note.read && "bg-muted/40")}
      >
        {/* The kind of notification sits on the avatar, so the row reads at a glance. */}
        <span className="relative shrink-0">
          {showActor ? (
            <Avatar user={note.actor} size={40} />
          ) : (
            <span className="grid size-10 place-items-center rounded-full bg-muted">
              <Icon className="size-5" aria-hidden="true" />
            </span>
          )}
          {showActor ? (
            <span
              aria-hidden="true"
              className="absolute -right-1 -bottom-1 grid size-5 place-items-center rounded-full bg-foreground text-background ring-2 ring-background"
            >
              <Icon className="size-3" />
            </span>
          ) : null}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="text-[15px] leading-snug">
            {note.read ? null : <span className="sr-only">Unread: </span>}
            {showActor ? <span className="font-semibold">{note.actor.name}</span> : null}
            {showActor ? " " : null}
            <span className={cn(showActor && "text-muted-foreground")}>{text}</span>
          </p>
          <p className="text-[13px] text-muted-foreground">
            <RelativeTime at={note.createdAt} />
          </p>
          {note.post?.body ? (
            <p className="mt-1 line-clamp-2 rounded-xl bg-muted px-3 py-2 text-[14px] leading-snug text-muted-foreground">{note.post.body}</p>
          ) : null}
        </div>
        {note.read ? null : <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-foreground" />}
      </Link>
    </li>
  )
}
