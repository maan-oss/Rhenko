import { Suspense } from "react"
import Link from "next/link"
import { AtSign, Bell, BellRing, Heart, ListChecks, MessageCircle, Quote, Repeat2, UserPlus, UserRound } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { requireViewer, type Viewer } from "@/lib/auth"
import { followRequestsFor, notificationsFor, type NotificationKind, type NotificationView } from "@/lib/data"
import { firstParam } from "@/lib/params"
import { RelativeTime } from "@/components/app/time-text"
import { Avatar } from "@/components/app/avatar"
import { FollowRequestRow } from "@/components/app/follow-request-row"
import { NotificationsMarker } from "@/components/app/notifications-marker"
import { PageHeader } from "@/components/app/page-header"
import { TabLinks } from "@/components/app/tabs"
import { cn } from "@/lib/utils"

type SearchParams = Promise<{ tab?: string | string[] }>

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

export default function NotificationsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={null}>
      <NotificationsBody searchParams={searchParams} />
    </Suspense>
  )
}

async function NotificationsBody({ searchParams }: { searchParams: SearchParams }) {
  const viewer = await requireViewer()
  const tab = firstParam((await searchParams).tab) === "mentions" ? "mentions" : "all"
  const notes = notificationsFor(viewer.id, tab)
  const requests = tab === "all" ? followRequestsFor(viewer.id) : []

  return (
    <>
      <PageHeader title="Notifications" />
      <TabLinks
        items={[
          { href: "/notifications", label: "All", icon: <Bell />, active: tab === "all" },
          { href: "/notifications?tab=mentions", label: "Mentions", icon: <AtSign />, active: tab === "mentions" },
        ]}
      />
      <NotificationsMarker />
      {requests.length > 0 ? (
        <section aria-label="Follow requests">
          <h2 className="px-4 pt-4 pb-2 text-sm font-semibold text-muted-foreground">Follow requests</h2>
          <ul className="list-none">
            {requests.map((request) => (
              <FollowRequestRow key={request.id} user={request} />
            ))}
          </ul>
        </section>
      ) : null}
      {notes.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 px-6 pt-14 pb-16 text-center">
          <p className="text-lg font-semibold">{tab === "mentions" ? "No mentions yet" : "Nothing here yet"}</p>
          <p className="max-w-sm text-muted-foreground">Likes, replies, reposts and follows from other people show up here.</p>
        </div>
      ) : (
        <ul className="list-none">
          {notes.map((note) => (
            <NoteRow key={note.id} note={note} viewer={viewer} />
          ))}
        </ul>
      )}
    </>
  )
}

function NoteRow({ note, viewer }: { note: NotificationView; viewer: Viewer }) {
  const { text, Icon } = COPY[note.kind]
  // Likes, reposts and poll results point at your own post. Replies, quotes and mentions point at theirs.
  const ownPost = note.kind === "like" || note.kind === "repost" || note.kind === "poll"
  const href = note.post && note.kind !== "follow" && note.kind !== "follow_request" ? `/${ownPost ? viewer.handle : note.actor.handle}/status/${note.post.id}` : `/${note.actor.handle}`
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
