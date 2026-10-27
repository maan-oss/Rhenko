import Link from "next/link"
import { Timer, Users } from "lucide-react"
import { Avatar } from "@/components/app/avatar"
import { RelativeTime } from "@/components/app/time-text"
import type { ConversationSummary, MiniUser } from "@/lib/data"
import { timerLabel } from "@/lib/message-timers"
import { cn } from "@/lib/utils"

// What a conversation is called in the list: the group's name, or the people in it when it has none.
export function conversationTitle(conversation: ConversationSummary): string {
  const names = conversation.others.map((person) => person.name).join(", ")
  if (conversation.kind === "group") return conversation.title || names || "Group"
  return conversation.others[0]?.name ?? "Conversation"
}

// One person's photo for a chat, two overlapping for a group, and a group mark when nobody else is left.
function ConversationAvatar({ kind, people }: { kind: "dm" | "group"; people: MiniUser[] }) {
  if (kind === "dm" && people[0]) return <Avatar user={people[0]} size={48} />
  if (people.length >= 2) {
    return (
      <span aria-hidden="true" className="relative size-12 shrink-0">
        <Avatar user={people[0]} size={32} className="absolute top-0 left-0 ring-2 ring-background" />
        <Avatar user={people[1]} size={32} className="absolute right-0 bottom-0 ring-2 ring-background" />
      </span>
    )
  }
  if (people[0]) return <Avatar user={people[0]} size={48} />
  return (
    <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
      <Users className="size-5" />
    </span>
  )
}

// A row in the messages list. It opens the conversation.
export function ConversationRow({ conversation }: { conversation: ConversationSummary }) {
  const unread = conversation.unread > 0
  const preview = conversation.lastBody
    ? `${conversation.lastFromMe ? "You: " : ""}${conversation.lastBody}`
    : conversation.lastDeleted
      ? "Message deleted"
      : "No messages yet"
  return (
    <li className="border-b border-border">
      <Link href={`/messages/${conversation.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
        <ConversationAvatar kind={conversation.kind} people={conversation.others} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className={cn("truncate text-[15px]", unread ? "font-bold" : "font-semibold")}>{conversationTitle(conversation)}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {conversation.messageTimer > 0 ? (
                <>
                  <Timer className="mr-1 inline size-3.5 align-[-3px]" aria-hidden="true" />
                  <span className="sr-only">Disappearing messages: {timerLabel(conversation.messageTimer)}. </span>
                </>
              ) : null}
              <RelativeTime at={conversation.lastAt} />
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn("truncate text-sm", unread ? "text-foreground" : "text-muted-foreground")}>{preview}</span>
            {unread ? (
              <span
                aria-label={`${conversation.unread} unread ${conversation.unread === 1 ? "message" : "messages"}`}
                className="ml-auto grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-foreground px-1.5 text-[11px] font-semibold text-background tabular-nums"
              >
                {conversation.unread}
              </span>
            ) : null}
          </div>
        </div>
      </Link>
    </li>
  )
}
