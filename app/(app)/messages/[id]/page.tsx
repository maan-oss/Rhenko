import Link from "next/link"
import { notFound } from "next/navigation"
import { requireViewer } from "@/lib/auth"
import { conversationFor, conversationMessages } from "@/lib/data"
import { AcceptBar } from "@/components/app/accept-bar"
import { Avatar } from "@/components/app/avatar"
import { CallButton } from "@/components/app/call-button"
import { ChatComposer } from "@/components/app/chat-composer"
import { ChatThread } from "@/components/app/chat-thread"
import { GroupCallButton } from "@/components/app/group-call-button"
import { GroupPanel } from "@/components/app/group-panel"
import { MuteConversationButton } from "@/components/app/mute-conversation-button"
import { PageHeader } from "@/components/app/page-header"
import { ThreadMarker } from "@/components/app/thread-marker"

type Params = Promise<{ id: string }>

// The thread opens with the newest messages. A full page means older ones may be waiting behind the
// "Load earlier messages" button.
const THREAD_PAGE = 200

// Existence checks run before anything streams, so a missing record gets a real 404.
export const instant = false

export default async function ConversationPage({ params }: { params: Params }) {
  const viewer = await requireViewer()
  if (!await conversationFor((await params).id, viewer.id)) notFound()
  return <ConversationBody params={params} />
}

async function ConversationBody({ params }: { params: Params }) {
  const viewer = await requireViewer()
  const { id } = await params
  const conversation = await conversationFor(id, viewer.id)
  if (!conversation) notFound()

  const messages = await conversationMessages(id, viewer.id, THREAD_PAGE)
  const others = conversation.members.filter((m) => m.id !== viewer.id)
  const isGroup = conversation.kind === "group"
  const title = isGroup ? conversation.title || others.map((o) => o.name).join(", ") : others[0]?.name ?? "Conversation"
  const requested = conversation.status === "requested"
  // A direct conversation whose other person declined or left: its history stays, but nothing more can be sent to them.
  const closed = !isGroup && others.length > 0 && others.every((m) => m.departed)
  const orderedMembers = conversation.members.filter((m) => m.status === "requested" || m.status === "accepted")

  // The page fills the screen, so the thread takes the room above and the composer (or the request notice) sits at the bottom.
  // On a phone the main column reserves room for the dock; a conversation has its own bottom row, so that room is given back.
  return (
    <div className="-mb-24 flex min-h-dvh flex-col lg:mb-0">
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
            {isGroup ? <GroupCallButton conversationId={conversation.id} disabled={requested} /> : null}
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
                disabled={requested || closed}
              />
            ) : null}
            {!isGroup && others[0] ? (
              <CallButton
                conversationId={conversation.id}
                peer={{ id: others[0].id, name: others[0].name, handle: others[0].handle, avatarFile: others[0].avatarFile }}
                disabled={requested || closed}
                video
              />
            ) : null}
            <MuteConversationButton conversationId={conversation.id} muted={conversation.muted} />
          </div>
        }
      />
      <ThreadMarker conversationId={conversation.id} />
      {requested ? <AcceptBar conversationId={conversation.id} /> : null}
      <div className="flex flex-1 flex-col">
        <ChatThread conversationId={conversation.id} messages={messages} showNames={isGroup} mayHaveEarlier={messages.length >= THREAD_PAGE} />
      </div>
      {requested ? (
        // Left space matches the composer, so the folded dock on a phone never sits over the text.
        <p className="sticky bottom-0 z-10 border-t border-border bg-background/95 px-4 pt-3 pb-6 pl-[72px] text-sm text-muted-foreground backdrop-blur lg:pt-4 lg:pb-4 lg:pl-4">
          Accept the request to reply.
        </p>
      ) : closed ? (
        <p className="sticky bottom-0 z-10 border-t border-border bg-background/95 px-4 pt-3 pb-6 pl-[72px] text-sm text-muted-foreground backdrop-blur lg:pt-4 lg:pb-4 lg:pl-4">
          {others[0].name} can&apos;t receive messages here anymore.
        </p>
      ) : (
        <ChatComposer conversationId={conversation.id} />
      )}
    </div>
  )
}
