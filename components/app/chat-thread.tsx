"use client"

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { PhoneIncoming, PhoneMissed, PhoneOff, PhoneOutgoing, SmilePlus, Trash2, Users } from "lucide-react"
import { toast } from "sonner"
import { deleteMessage, loadEarlierMessages, toggleReaction } from "@/actions/messages"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { PostBody } from "@/components/app/post-body"
import { LocalTime } from "@/components/app/time-text"
import { callSummary } from "@/lib/format"
import { isVoiceFile } from "@/lib/media-names"
import type { MessageView } from "@/lib/data"
import { REACTIONS } from "@/lib/rules"
import { cn } from "@/lib/utils"

// A call record as the thread reads it. Group records say so and how many people joined.
type CallRecord = NonNullable<MessageView["call"]>

// Oldest first, each message once.
function mergeOlder(current: MessageView[], more: MessageView[]): MessageView[] {
  const byId = new Map<string, MessageView>()
  for (const message of [...current, ...more]) byId.set(message.id, message)
  return [...byId.values()].sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

function rowFor(list: HTMLElement | null, id: string): HTMLElement | null {
  return list?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(id)}"]`) ?? null
}

// Shows the conversation, reactions, photos and shared posts, calls, and who is typing. The newest page comes from the
// server; "Load earlier messages" adds older ones above it without moving what is on screen.
export function ChatThread({
  conversationId,
  messages,
  showNames,
  mayHaveEarlier,
}: {
  conversationId: string
  messages: MessageView[]
  showNames: boolean
  mayHaveEarlier: boolean
}) {
  const endRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const anchor = useRef<{ id: string; top: number } | null>(null)
  const [typing, setTyping] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const [earlier, setEarlier] = useState<MessageView[]>([])
  const [atStart, setAtStart] = useState(false)
  const [loading, startLoading] = useTransition()
  const [page, setPage] = useState(messages)

  // The newest page moves on as messages arrive. Once older messages are showing, whatever slides out of the page
  // stays in the thread, so it never has a gap.
  if (page !== messages) {
    if (earlier.length > 0) {
      const ids = new Set(messages.map((message) => message.id))
      const oldest = messages[0]?.createdAt ?? Number.POSITIVE_INFINITY
      const slid = page.filter((message) => !ids.has(message.id) && message.createdAt <= oldest)
      if (slid.length > 0) setEarlier(mergeOlder(earlier, slid))
    }
    setPage(messages)
  }

  const pageIds = new Set(messages.map((message) => message.id))
  const shown = [...earlier.filter((message) => !pageIds.has(message.id)), ...messages]
  const newest = messages[messages.length - 1]?.id ?? null

  // Start at the newest message, and follow new ones. Older messages added above do not move the view. The scroll
  // waits for the first frame so the thread has its height before it moves.
  useEffect(() => {
    if (!newest) return
    const frame = requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: "end" }))
    return () => cancelAnimationFrame(frame)
  }, [newest])

  // After older messages are added, the message that was first stays where it was on screen.
  useLayoutEffect(() => {
    const saved = anchor.current
    if (!saved) return
    anchor.current = null
    const row = rowFor(listRef.current, saved.id)
    if (row) window.scrollBy(0, row.getBoundingClientRect().top - saved.top)
  }, [earlier])

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

  if (shown.length === 0) {
    return <p className="px-6 pt-14 pb-16 text-center text-muted-foreground">No messages yet. Say hello.</p>
  }

  const canLoad = (mayHaveEarlier || earlier.length > 0) && !atStart

  function loadEarlier() {
    const first = shown[0]
    if (!first) return
    const row = rowFor(listRef.current, first.id)
    anchor.current = row ? { id: first.id, top: row.getBoundingClientRect().top } : null
    startLoading(async () => {
      try {
        const older = await loadEarlierMessages(conversationId, first.createdAt)
        if (older.length === 0) {
          anchor.current = null
          setAtStart(true)
          return
        }
        setEarlier((current) => mergeOlder(current, older))
      } catch {
        anchor.current = null
        toast.error("Couldn't load earlier messages. Check your connection and try again.")
      }
    })
  }

  const lastOwn = [...shown].reverse().find((m) => m.mine && !m.call)

  return (
    <div ref={listRef} className="flex flex-col pt-4 pb-12">
      {canLoad ? (
        <div className="flex justify-center px-4 pb-2">
          <button
            type="button"
            onClick={loadEarlier}
            disabled={loading}
            aria-busy={loading}
            className="glass h-9 rounded-full px-4 text-[14px] font-medium text-foreground outline-none transition-colors duration-200 hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          >
            {loading ? "Loading earlier messages…" : "Load earlier messages"}
          </button>
        </div>
      ) : atStart ? (
        <p className="px-4 pb-2 text-center text-xs text-muted-foreground">This is the start of the conversation.</p>
      ) : null}
      {shown.map((message, index) => {
        const previous = shown[index - 1]
        const next = shown[index + 1]
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
  return a.senderId === b.senderId && !a.deleted && !b.deleted && !a.call && !b.call && Math.abs(b.createdAt - a.createdAt) < RUN_MS
}

// A call in the thread: a centred line with what happened, from the viewer's side. A missed call stands out. A group
// call says how many joined and how long it ran.
function CallEvent({ message }: { message: MessageView }) {
  const call: CallRecord | null = message.call
  if (!call) return null
  const group = call.kind === "group"
  const label = callSummary(call.outcome, call.seconds, message.mine, call.kind, call.people)
  const missed = call.outcome === "missed" && !message.mine
  const Icon = missed
    ? PhoneMissed
    : call.outcome === "failed" || call.outcome === "declined"
      ? PhoneOff
      : group
        ? Users
        : call.outcome === "ended" && !message.mine
          ? PhoneIncoming
          : PhoneOutgoing
  return (
    <div data-message-id={message.id} className="flex flex-col items-center gap-1.5 px-4 pt-4">
      <div
        className={cn(
          "inline-flex max-w-full items-center gap-2 rounded-full border px-3.5 py-1.5 text-[14px] font-medium",
          missed ? "border-destructive/30 text-destructive" : "border-border text-foreground/80"
        )}
      >
        <Icon className="size-[15px] shrink-0" strokeWidth={2} aria-hidden="true" />
        <span className="truncate">{label}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        <LocalTime at={message.createdAt} variant="clock" />
      </p>
    </div>
  )
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

  if (message.call) return <CallEvent message={message} />

  return (
    <div
      data-message-id={message.id}
      className={cn("group flex flex-col gap-1 px-4", joinsPrev ? "pt-[3px]" : "pt-3", message.mine ? "items-end" : "items-start")}
    >
      {showName ? <span className="text-xs text-muted-foreground">{message.senderName}</span> : null}
      <div className={cn("flex items-end gap-2", message.mine && "flex-row-reverse")}>
        <div
          className={cn(
            "flex max-w-[min(78%,30rem)] flex-col gap-2 rounded-[22px] px-3.5 py-2.5 text-[15px] leading-relaxed",
            // Every bubble has the same shape. A run of messages is told apart by the space around it, not by the corners.
            // Text links take the bubble's colour. The shared-post card is a link too, but it sits on its own surface, so it is skipped.
            message.mine ? "bg-dusk text-background [&_a:not([data-embed])]:text-background [&_a:not([data-embed])]:underline" : "bg-muted",
            message.deleted && "italic opacity-70"
          )}
        >
          {message.deleted ? (
            <span>This message was deleted.</span>
          ) : (
            <>
              {message.mediaFile && isVoiceFile(message.mediaFile) ? (
                <audio controls preload="metadata" src={`/media/${message.mediaFile}`} aria-label="Voice message" className="block h-10 w-[240px] max-w-full" />
              ) : message.mediaFile ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/media/${message.mediaFile}`} alt="Shared photo" className="max-h-72 rounded-xl object-cover" />
              ) : null}
              {message.body ? <PostBody text={message.body} className="text-[15px]" /> : null}
              {message.post ? (
                <Link
                  href={`/${message.post.author.handle}/status/${message.post.id}`}
                  data-embed=""
                  className="block rounded-xl border border-border bg-background p-3 text-foreground no-underline"
                >
                  <span className="text-sm font-semibold">{message.post.author.name}</span>
                  {message.post.body ? <span className="mt-1 line-clamp-3 block text-sm">{message.post.body}</span> : null}
                </Link>
              ) : null}
              {message.postUnavailable ? (
                <p className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
                  This post is unavailable.
                </p>
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
