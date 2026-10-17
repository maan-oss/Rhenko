import { Suspense } from "react"
import Link from "next/link"
import { ChevronRight, Plus } from "lucide-react"
import { requireViewer } from "@/lib/auth"
import { conversationSummaries, requestCount } from "@/lib/data"
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
  const tab = firstParam((await searchParams).tab) === "requests" ? "requests" : "messages"
  const conversations = await conversationSummaries(viewer.id, tab === "requests" ? "requested" : "accepted")
  const requests = await requestCount(viewer.id)

  return (
    <>
      <PageHeader
        title="Messages"
        hideTitleOnPhone
        actions={
          <Button variant="outline" size="icon" nativeButton={false} render={<Link href="/messages/new" aria-label="New message" />} className="rounded-full">
            <Plus className="size-4" />
          </Button>
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
          className="depth-sheet mx-2 mt-2 mb-2 flex items-center justify-between gap-3 px-4 py-3.5 text-[15px] font-semibold transition-[box-shadow] duration-300 lg:hover:[box-shadow:var(--depth-lift)]"
        >
          <span>
            {requests} message {pluralize(requests, "request")}
          </span>
          <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
        </Link>
      ) : null}
      {tab === "requests" && conversations.length > 0 ? (
        <p className="px-4 pt-3 pb-1 text-sm text-muted-foreground">
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
