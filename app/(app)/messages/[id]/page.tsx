import Link from "next/link"
import { notFound } from "next/navigation"
import { requireViewer } from "@/lib/auth"
import { conversationFor, conversationMessages } from "@/lib/data"
import { AcceptBar } from "@/components/app/accept-bar"
import { CallButton } from "@/components/app/call-button"
import { ChatComposer } from "@/components/app/chat-composer"
import { ChatThread } from "@/components/app/chat-thread"
import { GroupPanel } from "@/components/app/group-panel"
import { MuteConversationButton } from "@/components/app/mute-conversation-button"
import { PageHeader } from "@/components/app/page-header"
import { ThreadMarker } from "@/components/app/thread-marker"

type Params = Promise<{ id: string }>

// Existence checks run before anything streams, so a missing record gets a real 404.
export const instant = false

export default async function ConversationPage({ params }: { params: Params }) {
  const viewer = await requireViewer()
  if (!conversationFor((await params).id, viewer.id)) notFound()
  return <ConversationBody params={params} />
}

async function ConversationBody({ params }: { params: Params }) {
  const viewer = await requireViewer()
  const { id } = await params
  const conversation = conversationFor(id, viewer.id)
  if (!conversation) notFound()

  const messages = conversationMessages(id, viewer.id)
  const others = conversation.members.filter((m) => m.id !== viewer.id)
  const isGroup = conversation.kind === "group"
  const title = isGroup ? conversation.title || others.map((o) => o.name).join(", ") : others[0]?.name ?? "Conversation"
  const requested = conversation.status === "requested"
  const orderedMembers = conversation.members.filter((m) => m.status === "requested" || m.status === "accepted")

  return (
    <>
      <PageHeader
        title={title}
        backHref="/messages"
        actions={
          <div className="flex items-center gap-2">
          {isGroup ? (
            <GroupPanel
              conversationId={conversation.id}
              title={conversation.title}
              members={[...orderedMembers, ...conversation.members.filter((m) => !orderedMembers.includes(m))].map((m) => ({
                id: m.id,
                name: m.name,
                handle: m.handle,
                status: m.status,
              }))}
            />
          ) : others[0] ? (
            <Link href={`/${others[0].handle}`} className="text-sm font-semibold text-foreground hover:underline">
              @{others[0].handle}
            </Link>
          ) : null}
          <CallButton name={title} />
          <MuteConversationButton conversationId={conversation.id} muted={conversation.muted} />
          </div>
        }
      />
      <ThreadMarker conversationId={conversation.id} />
      {requested ? <AcceptBar conversationId={conversation.id} /> : null}
      <ChatThread conversationId={conversation.id} messages={messages} showNames={isGroup} />
      {requested ? (
        <p className="sticky bottom-14 border-t border-border bg-background/95 px-4 py-4 text-sm text-muted-foreground backdrop-blur xl:bottom-0">
          Accept the request to reply.
        </p>
      ) : (
        <ChatComposer conversationId={conversation.id} />
      )}
    </>
  )
}
