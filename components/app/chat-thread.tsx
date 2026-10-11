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

  // Start at the newest message. The scroll waits for the first frame so the thread has its height before it moves.
  useEffect(() => {
    const frame = requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: "end" }))
    return () => cancelAnimationFrame(frame)
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
    return <p className="px-6 pt-14 pb-16 text-center text-muted-foreground">No messages yet. Say hello.</p>
  }

  const lastOwn = [...messages].reverse().find((m) => m.mine)

  return (
    <div className="flex flex-col pt-4 pb-12">
      {messages.map((message, index) => {
        const previous = messages[index - 1]
        const next = messages[index + 1]
        return (
          <MessageRow
            key={message.id}
            message={message}
            showSeen={message.id === lastOwn?.id && message.seen}
            // Messages from the same sender in quick succession stack into one run.
            joinsPrev={sameRun(previous, message)}
            joinsNext={sameRun(message, next)}
            // In a group, name the sender once at the start of each run of their messages.
            showName={showNames && !message.mine && !sameRun(previous, message)}
          />
        )
      })}
      {typing ? <p className="px-4 text-sm text-muted-foreground">{typing} is typing…</p> : null}
      {/* The margin is the sticky composer, so the newest message clears it when the thread scrolls to the end. */}
      <div ref={endRef} className="scroll-mb-[88px] lg:scroll-mb-[80px]" />
    </div>
  )
}

// Two messages from one sender, a few minutes apart, read as one run.
const RUN_MS = 5 * 60 * 1000

function sameRun(a: MessageView | undefined, b: MessageView | undefined): boolean {
  if (!a || !b) return false
  return a.senderId === b.senderId && !a.deleted && !b.deleted && Math.abs(b.createdAt - a.createdAt) < RUN_MS
}

function MessageRow({
  message,
  showSeen,
  showName,
  joinsPrev,
  joinsNext,
}: {
  message: MessageView
  showSeen: boolean
  showName: boolean
  joinsPrev: boolean
  joinsNext: boolean
}) {
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
    <div className={cn("group flex flex-col gap-1 px-4", joinsPrev ? "pt-[3px]" : "pt-3", message.mine ? "items-end" : "items-start")}>
      {showName ? <span className="text-xs text-muted-foreground">{message.senderName}</span> : null}
      <div className={cn("flex items-end gap-2", message.mine && "flex-row-reverse")}>
        <div
          className={cn(
            "flex max-w-[min(78%,30rem)] flex-col gap-2 rounded-[22px] px-3.5 py-2.5 text-[15px] leading-relaxed",
            // Every bubble has the same shape. A run of messages is told apart by the space around it, not by the corners.
            message.mine ? "bg-dusk text-background [&_a]:text-background [&_a]:underline" : "bg-muted",
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

      {/* The time sits under the last message of a run; the run shares it. */}
      {!joinsNext || showSeen ? (
        <p className="text-xs text-muted-foreground">
          {showSeen ? "Seen · " : null}
          <LocalTime at={message.createdAt} variant="clock" />
        </p>
      ) : null}
    </div>
  )
}
