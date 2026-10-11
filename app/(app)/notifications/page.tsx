import { Suspense } from "react"
import Link from "next/link"
import { AtSign, BellRing, Heart, ListChecks, MessageCircle, Quote, Repeat2, UserPlus, UserRound } from "lucide-react"
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
          { href: "/notifications", label: "All", active: tab === "all" },
          { href: "/notifications?tab=mentions", label: "Mentions", active: tab === "mentions" },
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
    <li className={cn("border-b border-border", !note.read && "bg-dusk/5")}>
      <Link href={href} className="flex gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
        <Icon className="mt-1 size-5 shrink-0 text-dusk" aria-hidden="true" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {showActor ? (
            <span className="flex items-center gap-2">
              <Avatar user={note.actor} size={32} />
            </span>
          ) : null}
          <p className="text-[15px]">
            {showActor ? <span className="font-semibold">{note.actor.name}</span> : null}
            {showActor ? " " : null}
            <span className="text-muted-foreground">{text}</span>
            <span className="ml-1 text-sm text-muted-foreground">· <RelativeTime at={note.createdAt} /></span>
          </p>
          {note.post?.body ? <p className="line-clamp-2 text-[15px] text-muted-foreground">{note.post.body}</p> : null}
        </div>
      </Link>
    </li>
  )
}
