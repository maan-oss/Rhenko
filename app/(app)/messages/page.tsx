import { Suspense } from "react"
import Link from "next/link"
import { MessageCircle, Plus, UserRoundPlus } from "lucide-react"
import { requireViewer } from "@/lib/auth"
import { conversationSummaries, requestCount } from "@/lib/data"
import { firstParam } from "@/lib/params"
import { RelativeTime } from "@/components/app/time-text"
import { Avatar } from "@/components/app/avatar"
import { PageHeader } from "@/components/app/page-header"
import { TabLinks } from "@/components/app/tabs"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type SearchParams = Promise<{ tab?: string | string[] }>

export default function MessagesPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={null}>
      <MessagesBody searchParams={searchParams} />
    </Suspense>
  )
}

async function MessagesBody({ searchParams }: { searchParams: SearchParams }) {
  const viewer = await requireViewer()
  const tab = firstParam((await searchParams).tab) === "requests" ? "requests" : "messages"
  const conversations = conversationSummaries(viewer.id, tab === "requests" ? "requested" : "accepted")
  const requests = requestCount(viewer.id)

  return (
    <>
      <PageHeader
        title="Messages"
        tabs={
          <TabLinks
            label="Messages sections"
            items={[
              { href: "/messages", label: "Messages", icon: <MessageCircle />, active: tab === "messages" },
              { href: "/messages?tab=requests", label: "Requests", icon: <UserRoundPlus />, active: tab === "requests", badge: requests },
            ]}
          />
        }
        actions={
          <Button variant="outline" size="icon" render={<Link href="/messages/new" aria-label="New message" />} className="rounded-full">
            <Plus className="size-4" />
          </Button>
        }
      />
      {conversations.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 px-6 pt-14 pb-16 text-center">
          <p className="text-lg font-semibold">{tab === "requests" ? "No message requests" : "No conversations yet"}</p>
          <p className="max-w-sm text-muted-foreground">
            {tab === "requests"
              ? "When someone you don't follow messages you, it lands here."
              : "Start one with the new message button, or from someone's profile."}
          </p>
        </div>
      ) : (
        <ul className="list-none">
          {conversations.map((conversation) => {
            const lead = conversation.others[0]
            const title = conversation.kind === "group" ? conversation.title || conversation.others.map((o) => o.name).join(", ") : lead?.name ?? "Conversation"
            const preview = conversation.lastBody
              ? `${conversation.lastFromMe ? "You: " : ""}${conversation.lastBody}`
              : conversation.lastDeleted
                ? "Message deleted"
                : "No messages yet"
            return (
              <li key={conversation.id} className="border-b border-border">
                <Link href={`/messages/${conversation.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
                  {lead ? (
                    <Avatar user={lead} size={48} />
                  ) : (
                    <span className="grid size-12 place-items-center rounded-full bg-muted text-sm font-semibold">{title.slice(0, 2)}</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={cn("truncate text-[15px]", conversation.unread > 0 ? "font-bold" : "font-semibold")}>{title}</span>
                      <span className="shrink-0 text-xs text-muted-foreground"><RelativeTime at={conversation.lastAt} /></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn("truncate text-sm", conversation.unread > 0 ? "text-foreground" : "text-muted-foreground")}>{preview}</span>
                      {conversation.unread > 0 ? (
                        <span className="ml-auto grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-dusk px-1.5 text-[11px] font-semibold text-background tabular-nums">
                          {conversation.unread}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
