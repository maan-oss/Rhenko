"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { SmilePlus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { deleteMessage, toggleReaction } from "@/actions/messages"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { PostBody } from "@/components/app/post-body"
import { LocalTime } from "@/components/app/time-text"
import type { MessageView } from "@/lib/data"
import { REACTIONS } from "@/lib/rules"
import { cn } from "@/lib/utils"

// Shows the conversation, reactions, photos and shared posts, and who is typing.
export function ChatThread({ conversationId, messages, showNames }: { conversationId: string; messages: MessageView[]; showNames: boolean }) {
  const endRef = useRef<HTMLDivElement>(null)
  const [typing, setTyping] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" })
  }, [messages.length])

  useEffect(() => {
    function onTyping(event: Event) {
      const detail = (event as CustomEvent<{ conversationId: string; name: string }>).detail
      if (detail.conversationId !== conversationId) return
      setTyping(detail.name)
      if (timer.current !== undefined) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setTyping(null), 3000)
    }
    window.addEventListener("rhenko:typing", onTyping)
    return () => {
      window.removeEventListener("rhenko:typing", onTyping)
      if (timer.current !== undefined) window.clearTimeout(timer.current)
    }
  }, [conversationId])

  if (messages.length === 0) {
    return <p className="px-4 py-16 text-center text-muted-foreground">No messages yet. Say hello.</p>
  }

  const lastOwn = [...messages].reverse().find((m) => m.mine)

  return (
    <div className="flex flex-col gap-3 py-4">
      {messages.map((message, index) => (
        <MessageRow
          key={message.id}
          message={message}
          showSeen={message.id === lastOwn?.id && message.seen}
          // In a group, name the sender once at the start of each run of their messages.
          showName={showNames && !message.mine && messages[index - 1]?.senderId !== message.senderId}
        />
      ))}
      {typing ? <p className="px-4 text-sm text-muted-foreground">{typing} is typing…</p> : null}
      <div ref={endRef} />
    </div>
  )
}

function MessageRow({ message, showSeen, showName }: { message: MessageView; showSeen: boolean; showName: boolean }) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  function react(emoji: string) {
    setPickerOpen(false)
    startTransition(async () => {
      const result = await toggleReaction(message.id, emoji)
      if (!result.ok) toast.error(result.error)
    })
  }

  return (
    <div className={cn("group flex flex-col gap-1 px-4", message.mine ? "items-end" : "items-start")}>
      {showName ? <span className="text-xs text-muted-foreground">{message.senderName}</span> : null}
      <div className={cn("flex items-end gap-2", message.mine && "flex-row-reverse")}>
        <div
          className={cn(
            "flex max-w-[min(78%,30rem)] flex-col gap-2 rounded-2xl px-3.5 py-2.5 text-[15px] leading-relaxed",
            message.mine ? "rounded-br-md bg-dusk text-background [&_a]:text-background [&_a]:underline" : "rounded-bl-md bg-muted",
            message.deleted && "italic opacity-70"
          )}
        >
          {message.deleted ? (
            <span>This message was deleted.</span>
          ) : (
            <>
              {message.mediaFile ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/media/${message.mediaFile}`} alt="Shared photo" className="max-h-72 rounded-xl object-cover" />
              ) : null}
              {message.body ? <PostBody text={message.body} className="text-[15px]" /> : null}
              {message.post ? (
                <Link
                  href={`/${message.post.author.handle}/status/${message.post.id}`}
                  className="block rounded-xl border border-border bg-background p-3 text-foreground no-underline"
                >
                  <span className="text-sm font-semibold">{message.post.author.name}</span>
                  <span className="text-sm text-muted-foreground"> @{message.post.author.handle}</span>
                  {message.post.body ? <span className="mt-1 line-clamp-3 block text-sm">{message.post.body}</span> : null}
                </Link>
              ) : null}
            </>
          )}
        </div>

        {!message.deleted ? (
          <div className={cn("flex items-center gap-0.5 pb-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100", pickerOpen && "opacity-100")}>
            <button
              type="button"
              aria-label="React"
              aria-expanded={pickerOpen}
              onClick={() => setPickerOpen((open) => !open)}
              className="grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-muted"
            >
              <SmilePlus className="size-4" />
            </button>
            {message.mine ? (
              <ConfirmDialog
                trigger={
                  <button type="button" aria-label="Delete message" className="grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-muted">
                    <Trash2 className="size-4" />
                  </button>
                }
                title="Delete this message?"
                description="It's removed for everyone in the conversation."
                confirmLabel="Delete"
                action={() => deleteMessage(message.id)}
              />
            ) : null}
          </div>
        ) : null}
      </div>

      {pickerOpen ? (
        <div role="group" aria-label="Choose a reaction" className="flex gap-1 rounded-full border border-border bg-background px-1.5 py-1">
          {REACTIONS.map((emoji) => (
            <button key={emoji} type="button" onClick={() => react(emoji)} className="grid size-8 place-items-center rounded-full text-lg hover:bg-muted">
              {emoji}
            </button>
          ))}
        </div>
      ) : null}

      {message.reactions.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {message.reactions.map((reaction) => (
            <button
              key={reaction.emoji}
              type="button"
              disabled={pending}
              aria-pressed={reaction.mine}
              aria-label={`${reaction.emoji} ${reaction.count}${reaction.mine ? ", yours" : ""}`}
              onClick={() => react(reaction.emoji)}
              className={cn(
                "flex items-center gap-1 rounded-full border px-2 py-0.5 text-sm tabular-nums",
                reaction.mine ? "border-dusk bg-dusk/10" : "border-border"
              )}
            >
              <span>{reaction.emoji}</span>
              <span>{reaction.count}</span>
            </button>
          ))}
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        {showSeen ? "Seen · " : null}
        <LocalTime at={message.createdAt} variant="clock" />
      </p>
    </div>
  )
}
