import { Suspense, type ReactNode } from "react"
import Link from "next/link"
import { AtSign, Heart, MessageCircle, Quote, Repeat2, UserPlus } from "lucide-react"
import { requireViewer } from "@/lib/auth"
import { notificationsFor, type NotificationView } from "@/lib/data"
import { timeAgo } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Avatar } from "@/components/app/avatar"
import { NotificationsMarker } from "@/components/app/notifications-marker"
import { PageHeader } from "@/components/app/page-header"

export default function NotificationsPage() {
  return (
    <Suspense fallback={null}>
      <NotificationsBody />
    </Suspense>
  )
}

const LABELS: Record<NotificationView["kind"], { text: string; icon: ReactNode }> = {
  like: { text: "liked your post", icon: <Heart className="size-4 text-dusk" /> },
  repost: { text: "reposted your post", icon: <Repeat2 className="size-4 text-dusk" /> },
  reply: { text: "replied to you", icon: <MessageCircle className="size-4 text-dusk" /> },
  quote: { text: "quoted your post", icon: <Quote className="size-4 text-dusk" /> },
  follow: { text: "followed you", icon: <UserPlus className="size-4 text-dusk" /> },
  mention: { text: "mentioned you", icon: <AtSign className="size-4 text-dusk" /> },
}

async function NotificationsBody() {
  const viewer = await requireViewer()
  const items = notificationsFor(viewer.id)
  return (
    <>
      <PageHeader title="Notifications" />
      <NotificationsMarker />
      {items.length === 0 ? (
        <div className="flex flex-col gap-2 px-4 py-16">
          <p className="text-lg font-semibold">Nothing yet</p>
          <p className="max-w-sm text-muted-foreground">Likes, reposts, replies and new followers show up here.</p>
        </div>
      ) : (
        <ul>
          {items.map((item) => {
            const label = LABELS[item.kind]
            const ownPost = item.kind === "like" || item.kind === "repost"
            const postHandle = ownPost ? viewer.handle : item.actor.handle
            return (
              <li key={item.id} className={cn("flex gap-3 border-b border-border px-4 py-3", !item.read && "bg-muted/60")}>
                <span className={cn("mt-2 w-0.5 shrink-0 self-stretch", item.read ? "bg-transparent" : "bg-dusk")} aria-hidden="true" />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="flex items-start gap-3">
                    <Link href={`/${item.actor.handle}`} className="shrink-0">
                      <Avatar user={item.actor} size={36} />
                    </Link>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-x-1.5 text-[15px]">
                        <span className="shrink-0">{label.icon}</span>
                        <Link href={`/${item.actor.handle}`} className="font-semibold hover:underline">
                          {item.actor.name}
                        </Link>
                        <span>{label.text}</span>
                        <span className="text-sm text-muted-foreground">{timeAgo(item.createdAt)}</span>
                      </p>
                      {item.post ? (
                        <Link
                          href={`/${postHandle}/status/${item.post.id}`}
                          className="mt-1 line-clamp-2 block text-[15px] text-muted-foreground hover:text-foreground"
                        >
                          {item.post.body || "Image post"}
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
