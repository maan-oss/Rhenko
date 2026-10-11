import Link from "next/link"
import { notFound } from "next/navigation"
import { requireViewer } from "@/lib/auth"
import { conversationFor, conversationMessages } from "@/lib/data"
import { AcceptBar } from "@/components/app/accept-bar"
import { Avatar } from "@/components/app/avatar"
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
        subtitle={!isGroup && others[0] ? `@${others[0].handle}` : isGroup ? `${conversation.members.length} people` : undefined}
        backHref="/messages"
        lead={
          !isGroup && others[0] ? (
            <Link href={`/${others[0].handle}`} aria-label={`Open ${others[0].name}'s profile`} className="shrink-0 rounded-full transition-opacity hover:opacity-80">
              <Avatar user={others[0]} size={36} />
            </Link>
          ) : null
        }
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
            ) : null}
            {!isGroup && others[0] ? (
              <CallButton
                conversationId={conversation.id}
                peer={{ id: others[0].id, name: others[0].name, handle: others[0].handle, avatarFile: others[0].avatarFile }}
                disabled={requested}
              />
            ) : null}
            <MuteConversationButton conversationId={conversation.id} muted={conversation.muted} />
          </div>
        }
      />
      <ThreadMarker conversationId={conversation.id} />
      {requested ? <AcceptBar conversationId={conversation.id} /> : null}
      <ChatThread conversationId={conversation.id} messages={messages} showNames={isGroup} />
      {requested ? (
        <p className="sticky bottom-0 border-t border-border bg-background/95 px-4 py-4 text-sm text-muted-foreground backdrop-blur">
          Accept the request to reply.
        </p>
      ) : (
        <ChatComposer conversationId={conversation.id} />
      )}
    </>
  )
}
