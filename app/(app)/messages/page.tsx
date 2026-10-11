import { Suspense } from "react"
import Link from "next/link"
import { requireViewer } from "@/lib/auth"
import { conversationsFor } from "@/lib/data"
import { timeAgo } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Avatar } from "@/components/app/avatar"
import { NewConversation } from "@/components/app/new-conversation"
import { PageHeader } from "@/components/app/page-header"
import { Poller } from "@/components/app/poller"

export default function MessagesPage() {
  return (
    <Suspense fallback={null}>
      <MessagesBody />
    </Suspense>
  )
}

async function MessagesBody() {
  const viewer = await requireViewer()
  const conversations = conversationsFor(viewer.id)
  return (
    <>
      <PageHeader title="Messages" />
      <NewConversation />
      {conversations.length === 0 ? (
        <div className="flex flex-col gap-2 px-4 py-12">
          <p className="text-lg font-semibold">No conversations yet</p>
          <p className="max-w-sm text-muted-foreground">Open a message with someone above, or from their profile.</p>
        </div>
      ) : (
        <ul>
          {conversations.map((conversation) => {
            const unread = conversation.unread > 0
            return (
              <li key={conversation.user.id}>
                <Link href={`/messages/${conversation.user.handle}`} className="flex gap-3 border-b border-border px-4 py-3 hover:bg-muted/50">
                  <Avatar user={conversation.user} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-baseline gap-2">
                      <span className="truncate font-semibold">{conversation.user.name}</span>
                      <span className="truncate text-sm text-muted-foreground">@{conversation.user.handle}</span>
                      <span className="ml-auto shrink-0 text-sm text-muted-foreground">{timeAgo(conversation.lastAt)}</span>
                    </p>
                    <p className={cn("truncate text-[15px]", unread ? "font-semibold" : "text-muted-foreground")}>
                      {conversation.lastFromMe ? "You: " : ""}
                      {conversation.lastBody}
                    </p>
                  </div>
                  {unread ? <span className="mt-2 size-2 shrink-0 bg-dusk" aria-label="Unread" /> : null}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
      <Poller intervalMs={15000} />
    </>
  )
}
