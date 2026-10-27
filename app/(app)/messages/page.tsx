import { Suspense } from "react"
import Link from "next/link"
import { Archive, ChevronRight, Plus, Star } from "lucide-react"
import { requireViewer } from "@/lib/auth"
import { archivedCount, conversationSummaries, requestCount } from "@/lib/data"
import { firstParam } from "@/lib/params"
import { pluralize } from "@/lib/format"
import { ConversationRow } from "@/components/app/conversation-row"
import { EmptyState, emptyActionClass } from "@/components/app/empty-state"
import { PageHeader } from "@/components/app/page-header"
import { TabLinks } from "@/components/app/tabs"
import { Button } from "@/components/ui/button"

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
  const requested = firstParam((await searchParams).tab)
  const tab = requested === "requests" || requested === "archived" ? requested : "messages"

  if (tab === "archived") {
    const archived = await conversationSummaries(viewer.id, "accepted", 60, true)
    return (
      <>
        <PageHeader title="Archived" backHref="/messages" subtitle="A new message brings a chat back to your chats." />
        {archived.length === 0 ? (
          <EmptyState title="No archived chats" body="Archive a chat from the options beside it in your list. It waits here until someone sends it a message." />
        ) : (
          <ul className="list-none">
            {archived.map((conversation) => (
              <ConversationRow key={conversation.id} conversation={conversation} />
            ))}
          </ul>
        )}
      </>
    )
  }

  const conversations = await conversationSummaries(viewer.id, tab === "requests" ? "requested" : "accepted")
  const requests = await requestCount(viewer.id)
  const archived = tab === "messages" ? await archivedCount(viewer.id) : 0

  return (
    <>
      <PageHeader
        title="Messages"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              nativeButton={false}
              render={<Link href="/messages/starred" aria-label="Starred messages" title="Starred messages" />}
              className="tap-44 rounded-full"
            >
              <Star className="size-4" />
            </Button>
            <Button variant="outline" size="icon" nativeButton={false} render={<Link href="/messages/new" aria-label="New message" />} className="tap-44 rounded-full">
              <Plus className="size-4" />
            </Button>
          </div>
        }
      >
        <TabLinks
          label="Messages sections"
          items={[
            { href: "/messages", label: "Chats", active: tab === "messages" },
            { href: "/messages?tab=requests", label: "Requests", active: tab === "requests", badge: requests },
          ]}
        />
      </PageHeader>
      {tab === "messages" && requests > 0 ? (
        <Link
          href="/messages?tab=requests"
          className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 text-[15px] font-semibold transition-colors hover:bg-muted/50"
        >
          <span>
            {requests} message {pluralize(requests, "request")}
          </span>
          <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
        </Link>
      ) : null}
      {tab === "messages" && archived > 0 ? (
        <Link
          href="/messages?tab=archived"
          className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 text-[15px] font-semibold transition-colors hover:bg-muted/50"
        >
          <span className="flex items-center gap-3">
            <Archive className="size-4 text-muted-foreground" aria-hidden="true" />
            Archived ({archived})
          </span>
          <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
        </Link>
      ) : null}
      {tab === "requests" && conversations.length > 0 ? (
        <p className="border-b border-border px-4 py-3 text-sm text-muted-foreground">
          Messages and group invites from people you don&apos;t follow. Open one to accept or decline it. Until you accept, they can&apos;t see that you&apos;ve
          read it.
        </p>
      ) : null}
      {conversations.length === 0 ? (
        tab === "requests" ? (
          <EmptyState
            title="No message requests"
            body="Messages and group invites from people you don't follow wait here until you accept them."
          />
        ) : (
          <EmptyState title="No conversations yet" body="Message someone you know, or start a group with a few people.">
            <Link href="/messages/new" className={emptyActionClass("primary")}>
              New message
            </Link>
          </EmptyState>
        )
      ) : (
        <ul className="list-none">
          {conversations.map((conversation) => (
            <ConversationRow key={conversation.id} conversation={conversation} />
          ))}
        </ul>
      )}
    </>
  )
}
