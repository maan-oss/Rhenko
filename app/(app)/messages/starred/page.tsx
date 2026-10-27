import Link from "@/components/app/link"
import { requireViewer } from "@/lib/auth"
import { conversationSummaries, starredMessages } from "@/lib/data"
import { attachmentPreview } from "@/lib/message-attachments"
import { conversationTitle } from "@/components/app/conversation-row"
import { EmptyState } from "@/components/app/empty-state"
import { PageHeader } from "@/components/app/page-header"
import { RelativeTime } from "@/components/app/time-text"
import { UnstarButton } from "@/components/app/unstar-button"

// The messages the viewer has starred, across every chat they are in. Only they can see this list.
export default async function StarredMessagesPage() {
  const viewer = await requireViewer()
  const [messages, chats, archived] = await Promise.all([
    starredMessages(viewer.id),
    conversationSummaries(viewer.id, "accepted", 200),
    conversationSummaries(viewer.id, "accepted", 200, true),
  ])
  const titles = new Map([...chats, ...archived].map((chat) => [chat.id, conversationTitle(chat)]))

  return (
    <>
      <PageHeader title="Starred messages" backHref="/messages" />
      {messages.length === 0 ? (
        <EmptyState title="No starred messages" body="Star a message from its menu and it appears here. Only you can see your stars." />
      ) : (
        <ul className="list-none">
          {messages.map((message) => {
            const preview = message.body || attachmentPreview(message.attachment, message.mediaFile) || "Message"
            return (
              <li key={message.id} className="flex items-center gap-2 border-b border-border px-4 py-3">
                <Link href={`/messages/${message.conversationId}`} className="min-w-0 flex-1 transition-colors hover:opacity-80">
                  <span className="block truncate text-sm font-semibold text-muted-foreground">{titles.get(message.conversationId) ?? "Conversation"}</span>
                  <span className="block truncate text-[15px]">{preview}</span>
                  <span className="block text-xs text-muted-foreground">
                    {message.mine ? "You" : message.senderName} · <RelativeTime at={message.createdAt} />
                  </span>
                </Link>
                <UnstarButton messageId={message.id} />
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
