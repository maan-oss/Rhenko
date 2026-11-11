"use client"

import { useEffect, useLayoutEffect, useRef, useState, useTransition, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type Ref } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion, useDragControls, useMotionValue, useMotionValueEvent, useReducedMotion, useTransform, type MotionValue } from "motion/react"
import Link from "@/components/app/link"
import { SEND_RISE, SPRING_BUBBLE, SPRING_POP } from "@/components/app/motion"
import { comeOut, hasFlight, launch, receive } from "@/components/app/send-flight"
import { AlarmClock, AlarmClockOff, Check, CheckCheck, Eye, EyeOff, Flag, Forward, Info, ListChecks, MoreHorizontal, Pin, PinOff, PhoneIncoming, PhoneMissed, PhoneOff, PhoneOutgoing, Pencil, Reply, Star, StarOff, Timer, TimerOff, Trash2, Users } from "lucide-react"
import { toast } from "sonner"
import { cancelMessageReminder, deleteMessage, editMessage, hideMessageForMe, loadEarlierMessages, openViewOnce, pinMessage, toggleReaction, toggleStarMessage } from "@/actions/messages"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { ChatReportDialog } from "@/components/app/chat-report-dialog"
import { ForwardDialog } from "@/components/app/forward-dialog"
import { MessageInfoDialog } from "@/components/app/message-info-dialog"
import { ReminderDialog } from "@/components/app/reminder-dialog"
import { THREAD_CHANGE_EVENT, useSelection, type ThreadChangeDetail } from "@/components/app/chat-selection"
import { MENU_ITEM_PHONE } from "@/components/app/overlay-sizes"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { removePending, usePending } from "@/components/app/pending-messages"
import { PostBody } from "@/components/app/post-body"
import { ContactCard, DocumentCard, LocationCard } from "@/components/app/attachment-view"
import { SealedAttachment } from "@/components/app/sealed-media"
import { editSealedMessage } from "@/lib/e2ee-client"
import { ChatPollView } from "@/components/app/chat-poll"
import { LinkCard } from "@/components/app/link-card"
import { VideoPlayer } from "@/components/app/video-player"
import { TranslateControl } from "@/components/app/translate-control"
import { LocalTime } from "@/components/app/time-text"
import { markThreadRead } from "@/components/app/thread-marker"
import { callSummary } from "@/lib/format"
import { isAudioFile, isDocumentFile, isVideoFile, isVoiceFile } from "@/lib/media-names"
import { quoteLabel } from "@/lib/message-attachments"
import { editRefusal } from "@/lib/chat-message-rules"
import { isExpired, nextExpiry, timerLine } from "@/lib/message-timers"
import type { MessageView } from "@/lib/data"
import { REACTIONS } from "@/lib/rules"
import { cn } from "@/lib/utils"
import { useImageWidth } from "@/lib/network"
import { useOpenedMessages } from "@/components/app/use-opened-messages"

// A call record as the thread reads it. Group records say so and how many people joined.
type CallRecord = NonNullable<MessageView["call"]>

// The longest the thread waits before it checks again for a disappearing message that is due.
const EXPIRY_CHECK_MAX_MS = 60 * 60 * 1000

// What this viewer changed in one message, kept over the thread until the page is refreshed.
type ThreadChange = { starred?: boolean; hidden?: boolean; body?: string; editedAt?: number }

// A message with this viewer's changes applied, so an older message in the thread shows its star or its edit at once.
function withChange(message: MessageView, change: ThreadChange | undefined): MessageView {
  if (!change) return message
  const starredView = change.starred === undefined ? message : { ...message, starred: change.starred }
  if (change.body === undefined) return starredView
  return { ...starredView, body: change.body, editedAt: change.editedAt ?? message.editedAt }
}

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
  focusId,
  hasNewer,
  canPin,
  encrypted,
}: {
  conversationId: string
  messages: MessageView[]
  showNames: boolean
  mayHaveEarlier: boolean
  // A message to open the thread at, from a search. Null for the newest messages.
  focusId: string | null
  // Whether messages go on past the ones shown, so the newest are a link away.
  hasNewer: boolean
  // Whether the viewer may pin messages here. Not while the chat is a request they haven't accepted.
  canPin: boolean
  // Whether the chat is end-to-end encrypted. Its messages are opened on this device.
  encrypted: boolean
}) {
  const selection = useSelection()
  // The message being reported, while its report dialog is open.
  const [reportingId, setReportingId] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const anchor = useRef<{ id: string; top: number } | null>(null)
  const [typing, setTyping] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const [earlier, setEarlier] = useState<MessageView[]>([])
  const [atStart, setAtStart] = useState(false)
  const [loading, startLoading] = useTransition()
  // The messages the thread opened with. Only a message that arrives after that rises in; the ones already there sit still.
  const [openedWith] = useState(() => new Set(messages.map((message) => message.id)))
  const [page, setPage] = useState(messages)
  // The moment the thread last checked for disappearing messages that are due. Zero until the first check.
  const [clock, setClock] = useState(0)
  // What this viewer changed in the thread: a star, or a message deleted for them. The server's newest page is refreshed, but the
  // copies of older messages kept here are not, so these changes are applied over the list.
  const [changes, setChanges] = useState<Record<string, ThreadChange>>({})

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
  const listedRaw = [...earlier.filter((message) => !pageIds.has(message.id)), ...messages]
    .filter((message) => !changes[message.id]?.hidden)
    .map((message) => withChange(message, changes[message.id]))
  // Encrypted messages show their text once this browser's device has opened them.
  const listed = useOpenedMessages(conversationId, listedRaw, encrypted)
  // A disappearing message leaves the thread the moment its time is up, without waiting for a refresh. The clock starts at
  // zero, so the first render is the page the server sent, which had already left out anything that was gone.
  const shown = clock === 0 ? listed : listed.filter((message) => !isExpired(message.expiresAt, clock))
  const soonest = nextExpiry(shown.map((message) => message.expiresAt), clock)
  const newest = messages[messages.length - 1]?.id ?? null

  // Wakes when the next message is due to go. A long wait is taken in steps, since a browser timer can't run for 30 days.
  useEffect(() => {
    if (soonest === null) return
    const wake = window.setTimeout(() => setClock(Date.now()), Math.min(Math.max(0, soonest - Date.now()), EXPIRY_CHECK_MAX_MS))
    return () => window.clearTimeout(wake)
  }, [soonest, clock])

  // Text the person sent that the server has not shown yet. A message of theirs with the same text, sent within two
  // minutes of the time on this screen, is the saved copy: the waiting one is then dropped.
  const pending = usePending(conversationId)
  const waiting = pending.filter(
    (item) => !shown.some((message) => message.mine && !message.call && message.body === item.body && message.createdAt >= item.createdAt - 120_000)
  )
  useEffect(() => {
    for (const item of pending) {
      if (!waiting.includes(item)) removePending(conversationId, item.key)
    }
  }, [pending, waiting, conversationId])

  // Opening a thread marks it read, and so does each message that arrives while it is open on screen. A tab in the background
  // waits until it is shown again.
  useEffect(() => {
    function markWhenShown() {
      if (document.visibilityState === "visible") markThreadRead(conversationId)
    }
    markWhenShown()
    document.addEventListener("visibilitychange", markWhenShown)
    return () => document.removeEventListener("visibilitychange", markWhenShown)
  }, [conversationId, newest])

  // Start at the newest message, and follow new ones. Older messages added above do not move the view. The scroll
  // waits for the first frame so the thread has its height before it moves.
  useEffect(() => {
    if (!newest || focusId) return
    const frame = requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: "end" }))
    return () => cancelAnimationFrame(frame)
  }, [newest, waiting.length, focusId])

  // A thread opened at a search hit goes to that message and lights it, and stays there while new messages arrive.
  useEffect(() => {
    if (!focusId) return
    const frame = requestAnimationFrame(() => jumpTo(focusId))
    return () => cancelAnimationFrame(frame)
  }, [focusId])

  // After older messages are added, the message that was first stays where it was on screen.
  useLayoutEffect(() => {
    const saved = anchor.current
    if (!saved) return
    anchor.current = null
    const row = rowFor(listRef.current, saved.id)
    if (row) window.scrollBy(0, row.getBoundingClientRect().top - saved.top)
  }, [earlier])

  // A bulk action (star or delete for me on a selection) reports the messages it changed, so the thread shows them at once.
  useEffect(() => {
    function onChange(event: Event) {
      const detail = (event as CustomEvent<ThreadChangeDetail>).detail
      setChanges((current) => {
        const next = { ...current }
        for (const id of detail.ids) next[id] = { ...next[id], ...detail.change }
        return next
      })
    }
    window.addEventListener(THREAD_CHANGE_EVENT, onChange)
    return () => window.removeEventListener(THREAD_CHANGE_EVENT, onChange)
  }, [])

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
    return <p className="px-6 pt-10 pb-6 text-center text-muted-foreground">No messages yet. Say hello.</p>
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

  const earlierIds = new Set(earlier.map((message) => message.id))

  return (
    <div ref={listRef} className="flex flex-col pt-4 pb-12">
      {canLoad ? (
        <div className="flex justify-center px-4 pb-2">
          <button
            type="button"
            onClick={loadEarlier}
            disabled={loading}
            aria-busy={loading}
            className="glass h-9 rounded-full px-4 text-[14px] font-medium text-foreground outline-none transition-colors duration-200 hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            {loading ? "Loading earlier messages…" : "Load earlier messages"}
          </button>
        </div>
      ) : atStart ? (
        <p className="px-4 pb-2 text-center text-xs text-muted-foreground">This is the start of the conversation.</p>
      ) : null}
      {shown.map((message, index) => {
        const previous = shown[index - 1]
        return (
          <MessageRow
            key={message.id}
            conversationId={conversationId}
            message={message}
            onChange={(change) => setChanges((current) => ({ ...current, [message.id]: { ...current[message.id], ...change } }))}
            fresh={!openedWith.has(message.id) && !earlierIds.has(message.id)}
            // Messages from the same sender in quick succession stack into one run.
            joinsPrev={sameRun(previous, message)}
            // In a group, name the sender once at the start of each run of their messages.
            showName={showNames && !message.mine && !sameRun(previous, message)}
            canPin={canPin}
            selecting={selection?.picked != null}
            picked={selection?.picked?.has(message.id) ?? false}
            onPick={() => selection?.toggle(message.id, message.starred)}
            onSelectStart={() => selection?.start(message.id, message.starred)}
            onReport={() => setReportingId(message.id)}
          />
        )
      })}
      {waiting.map((item) => {
        // A message of yours sent straight after another joins its run, with the run's tighter spacing, the same as it will be saved.
        const last = shown.at(-1)
        const joins = !!last && last.mine && !last.deleted && !last.call && last.timerChange === null && item.createdAt - last.createdAt < RUN_MS
        return <PendingBubble key={item.key} id={item.key} chatId={conversationId} body={item.body} joins={joins} />
      })}
      <AnimatePresence>{typing ? <TypingBubble key="typing" name={typing} /> : null}</AnimatePresence>
      <ChatReportDialog
        open={reportingId !== null}
        onOpenChange={(open) => {
          if (!open) setReportingId(null)
        }}
        conversationId={conversationId}
        encrypted={encrypted}
        messages={shown}
        messageId={reportingId ?? ""}
        canBlock={!showNames}
      />
      {hasNewer ? (
        <div className="flex justify-center px-4 pt-4">
          <Link href={`/messages/${conversationId}`} className="glass inline-flex h-9 items-center rounded-full px-4 text-[14px] font-medium text-foreground transition-colors hover:bg-foreground/5">
            Jump to the latest messages
          </Link>
        </div>
      ) : null}
      {/* The margin is the sticky composer, so the newest message clears it when the thread scrolls to the end. */}
      <div ref={endRef} data-thread-end className="scroll-mb-[88px] lg:scroll-mb-[80px]" />
    </div>
  )
}

// A photo of yours takes its height only when it loads, after the thread has already scrolled to the newest message. When it
// does load, the thread follows, so the bubble is not left under the composer.
function followLatest() {
  document.querySelector<HTMLElement>("[data-thread-end]")?.scrollIntoView({ block: "end" })
}

// A message being sent: it shows at once, until the saved copy arrives in the thread. The words leave the message box and
// turn into this bubble as it lands (components/app/send-flight.ts), so it does not rise in place then. It stays at full
// strength while it flies, so the saved bubble that replaces it looks exactly the same; with no flight, it is faded as before.
// The shape every bubble shares. A message being sent uses the same shape, colour and line, so the bubble that replaces it does not
// move.
const BUBBLE_SHAPE = "relative flex max-w-full min-w-0 flex-col gap-2 rounded-[20px] text-[15px] leading-[1.4] break-words"

// The tail on the top bubble of a run: a small wedge off its top corner, on the side the message comes from, in the bubble's own
// colour. Only the first bubble of a run has one; a reply from the other person in between starts a new run, with its own tail.
const TAIL_MINE =
  "rounded-tr-none after:absolute after:top-0 after:left-full after:h-[13px] after:w-[9px] after:content-[''] after:bg-dusk after:[clip-path:polygon(0_0,100%_0,0_100%)]"
const TAIL_THEIRS =
  "rounded-tl-none before:absolute before:top-0 before:right-full before:h-[13px] before:w-[9px] before:content-[''] before:bg-muted before:[clip-path:polygon(100%_0,0_0,100%_100%)]"

// Where a message's time sits inside its bubble: "inline" floats at the bottom-right of its words, on their last line (or on the
// line under them when the last line is full), the way a chat app sets it; "row" sits along the foot of a card; "picture" sits
// over a photo.
type MetaPlace = "inline" | "row" | "picture"

function metaClass(place: MetaPlace): string {
  return cn(
    "inline-flex items-center gap-1 whitespace-nowrap text-[11px] leading-none tabular-nums",
    place === "inline" && "float-right ml-2 h-[21px] opacity-70",
    place === "row" && "ml-auto px-1 pt-1 pb-0.5 opacity-70",
    place === "picture" && "absolute right-2 bottom-2 rounded-full bg-black/55 px-2 py-[5px] text-white backdrop-blur-[2px]"
  )
}

// A message being sent: its words, with "Sending…" where the time will be.
function PendingBubble({ id, chatId, body, joins }: { id: string; chatId: string; body: string; joins: boolean }) {
  const [flies] = useState(() => hasFlight(id))
  const columnRef = useRef<HTMLDivElement>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)
  const statusRef = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const bubble = bubbleRef.current
    const column = columnRef.current
    // The bubble stays hidden while the words fly; it comes out once it has landed.
    if (!flies || !bubble || !column) return
    launch(bubble, id, chatId, () => comeOut(statusRef.current), column)
  }, [flies, id, chatId])
  return (
    <motion.div
      initial={flies ? false : { opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: flies ? 1 : 0.72, y: 0, scale: 1 }}
      transition={SEND_RISE}
      style={{ transformOrigin: "100% 100%" }}
      className={cn("flex flex-col items-end px-4", joins ? "pt-[3px]" : "pt-3")}
    >
      <div ref={columnRef} className="flex max-w-[min(78%,30rem)] min-w-0 flex-col items-end">
        <div ref={bubbleRef} className={cn(BUBBLE_SHAPE, "bg-dusk px-3.5 py-2 text-background", !joins && TAIL_MINE)}>
          <p className="flow-root whitespace-pre-wrap">
            <span data-flight-text>{body}</span>
            <span ref={statusRef} aria-live="polite" className={metaClass("inline")}>
              Sending…
            </span>
          </p>
        </div>
      </div>
    </motion.div>
  )
}

// The other person is typing: three dots that rise in turn, in a bubble that opens up from the corner where the reply
// will land. It leaves with a fade. The same dots and timing as Parley's typing indicator.
function TypingBubble({ name }: { name: string }) {
  const still = useReducedMotion()
  return (
    <motion.div
      role="status"
      initial={{ opacity: 0, y: 10, scale: 0.86 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.12 } }}
      transition={SPRING_BUBBLE}
      style={{ transformOrigin: "0% 100%" }}
      className="flex items-end gap-2 px-4 pt-3"
    >
      <span className="flex items-center gap-[5px] rounded-[22px] bg-muted px-3.5 py-3.5">
        {[0, 1, 2].map((dot) => (
          <motion.span
            key={dot}
            aria-hidden="true"
            className="size-[7px] rounded-full bg-foreground/55"
            animate={still ? undefined : { y: [0, -3.5, 0], opacity: [0.35, 1, 0.35] }}
            transition={{ duration: 1.05, repeat: Infinity, delay: dot * 0.16, ease: "easeInOut" }}
          />
        ))}
      </span>
      <span className="sr-only">{name} is typing</span>
    </motion.div>
  )
}

// Two messages from one sender, a few minutes apart, read as one run.
const RUN_MS = 5 * 60 * 1000

function sameRun(a: MessageView | undefined, b: MessageView | undefined): boolean {
  if (!a || !b) return false
  if (a.timerChange !== null || b.timerChange !== null) return false
  return a.senderId === b.senderId && !a.deleted && !b.deleted && !a.call && !b.call && Math.abs(b.createdAt - a.createdAt) < RUN_MS
}

// A change to the disappearing-messages timer: a centred line in the thread, like a call, with who changed it and when.
function TimerEvent({ message }: { message: MessageView }) {
  const value = message.timerChange ?? 0
  const Icon = value > 0 ? Timer : TimerOff
  return (
    <div data-message-id={message.id} className="flex flex-col items-center gap-1.5 px-4 pt-4">
      <div className="inline-flex max-w-full items-center gap-2 rounded-[18px] border border-border px-3.5 py-1.5 text-center text-[14px] font-medium text-foreground/80">
        <Icon className="size-[15px] shrink-0" strokeWidth={2} aria-hidden="true" />
        <span className="min-w-0 text-balance">{timerLine(value)}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        {message.mine ? "You" : message.senderName} · <LocalTime at={message.createdAt} variant="clock" />
      </p>
    </div>
  )
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

// What a message reads as when it is quoted: its words, or what it was instead.
function previewOf(message: MessageView): string {
  if (message.body) return message.body
  return quoteLabel(message.attachment, message.mediaFile, message.post !== null)
}

// Scrolls to a message on screen and lights it for a moment. Reduced motion gets the jump without the flash.
function jumpTo(id: string) {
  const row = document.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(id)}"]`)
  if (!row) {
    toast("That message is further up. Load earlier messages to see it.")
    return
  }
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  row.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" })
  if (!reduced) row.animate([{ backgroundColor: "color-mix(in oklab, var(--foreground) 10%, transparent)" }, { backgroundColor: "transparent" }], { duration: 1400 })
}

// The words of a message being edited: a box, and Save or Cancel. Enter saves, Shift+Enter starts a new line, Escape cancels.
function EditBox({
  value,
  onChange,
  onSave,
  onCancel,
  pending,
}: {
  value: string
  onChange: (value: string) => void
  onSave: () => void
  onCancel: () => void
  pending: boolean
}) {
  return (
    <div className="flex min-w-[220px] flex-col gap-2">
      <textarea
        aria-label="Edit message"
        value={value}
        rows={Math.min(8, Math.max(2, value.split("\n").length))}
        autoFocus
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel()
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault()
            onSave()
          }
        }}
        className="w-full resize-none rounded-lg bg-background px-2.5 py-2 text-[15px] leading-relaxed text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <div className="flex justify-end gap-2 text-sm">
        <button type="button" onClick={onCancel} className="tap-44 rounded-full px-3 py-1 font-semibold transition-colors hover:bg-background/20">
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={pending}
          className="tap-44 rounded-full bg-background px-3 py-1 font-semibold text-foreground transition-opacity disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </div>
  )
}

// A view-once photo or video before it is opened: a tap opens it, once. Once opened, it is only a label.
function ViewOnceTile({ video, opened, pending, onOpen }: { video: boolean; opened: boolean; pending: boolean; onOpen: () => void }) {
  const label = video ? "video" : "photo"
  const tone = "flex w-full min-w-0 max-w-[300px] items-center gap-3 rounded-xl bg-background p-2.5 text-left text-foreground transition-colors"
  if (opened) {
    return (
      <div className={tone}>
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-foreground/10">
          <EyeOff className="size-5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold">Opened</span>
          <span className="block text-[12px] text-muted-foreground">View once {label}</span>
        </span>
      </div>
    )
  }
  return (
    <button type="button" onClick={onOpen} disabled={pending} className={cn(tone, "hover:bg-foreground/5 disabled:opacity-50")}>
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-foreground/10">
        <Eye className="size-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold">View once {label}</span>
        <span className="block text-[12px] text-muted-foreground">Opens once. Tap to see it.</span>
      </span>
    </button>
  )
}

// The meta of a message: its marks, "Edited", the time, and for your messages the ticks (one when delivered, two when seen).
function Meta({ message, place, refer }: { message: MessageView; place: MetaPlace; refer?: Ref<HTMLSpanElement> }) {
  return (
    <span ref={refer} className={metaClass(place)}>
      {message.viewOnce ? (
        <>
          <Eye className="size-3" aria-hidden="true" />
          <span className="sr-only">View once, </span>
        </>
      ) : null}
      {message.starred ? (
        <>
          <Star className="size-3" aria-hidden="true" />
          <span className="sr-only">Starred, </span>
        </>
      ) : null}
      {message.pinned ? (
        <>
          <Pin className="size-3" aria-hidden="true" />
          <span className="sr-only">Pinned, </span>
        </>
      ) : null}
      {message.reminderAt !== null ? (
        <>
          <AlarmClock className="size-3" aria-hidden="true" />
          <span className="sr-only">Reminder set, </span>
        </>
      ) : null}
      {message.expiresAt !== null ? (
        <>
          <Timer className="size-3" aria-hidden="true" />
          <span className="sr-only">Disappearing message, </span>
        </>
      ) : null}
      {message.editedAt !== null ? <span>Edited</span> : null}
      <LocalTime at={message.createdAt} variant="clock" />
      {message.mine ? <Ticks seen={message.seen} /> : null}
    </span>
  )
}

// One tick is delivered; two ticks, in full ink, are seen.
function Ticks({ seen }: { seen: boolean }) {
  const Icon = seen ? CheckCheck : Check
  return (
    <span className={cn("inline-flex", !seen && "opacity-60")}>
      <Icon className="size-[14px]" aria-hidden="true" />
      <span className="sr-only">{seen ? "Seen" : "Delivered"}</span>
    </span>
  )
}

// Chat words fold after a long stretch: the opening words stop at a space, with "See more" right after them, and the time on that
// same line.
const FOLD_CHARS = 460
const FOLD_LINES = 9

// Where a long message folds, or null when it is short enough to show whole.
function foldPoint(text: string): number | null {
  let cut: number | null = null
  if (text.length > FOLD_CHARS) {
    const space = text.lastIndexOf(" ", FOLD_CHARS)
    cut = space > FOLD_CHARS * 0.6 ? space : FOLD_CHARS
  }
  const lines = text.split("\n")
  if (lines.length > FOLD_LINES) {
    const at = lines.slice(0, FOLD_LINES).join("\n").length
    cut = cut === null ? at : Math.min(cut, at)
  }
  return cut === null || cut >= text.length ? null : cut
}

// The words of a message, with its time at the end of the last line, as most chat apps set them. A folded message ends its words
// with "…" and gives its own line below them: "See more" on the left, and the time and read state on the right of that line.
function ChatText({ text, message, refer }: { text: string; message: MessageView; refer: Ref<HTMLSpanElement> }) {
  const [open, setOpen] = useState(false)
  const cut = open ? null : foldPoint(text)
  // The time floats at the bottom-right of the words, on their last line. A folded message puts "See more" after its last words,
  // and the time comes after that.
  const time = <Meta message={message} place="inline" refer={refer} />
  if (cut === null) {
    return <PostBody text={text} fold={false} className="flow-root text-[15px] leading-[1.4]" after={time} />
  }
  return (
    <PostBody
      text={`${text.slice(0, cut).trimEnd()}…`}
      fold={false}
      className="flow-root text-[15px] leading-[1.4]"
      after={
        <>
          {" "}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-sm font-semibold outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            See more
          </button>
          {time}
        </>
      }
    />
  )
}

// How far a swipe must go before a release replies, and how far the bubble can be pulled.
const REPLY_SWIPE = 56
const SWIPE_MAX = 76
// How long a hold lasts before it opens the actions for a message.
const HOLD_MS = 420

// The reply mark in the gap a swipe opens. It fills once a release will reply.
function SwipeCue({ progress, armed, mine }: { progress: MotionValue<number>; armed: boolean; mine: boolean }) {
  const scale = useTransform(progress, [0, 1], [0.6, 1])
  return (
    <motion.span
      aria-hidden="true"
      style={{ opacity: progress, scale }}
      className={cn(
        "pointer-events-none absolute top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full transition-colors duration-150",
        armed ? "bg-foreground text-background" : "bg-muted text-foreground",
        mine ? "right-2" : "left-2"
      )}
    >
      <Reply className="size-4" />
    </motion.span>
  )
}

// The actions for a message, opened by a hold or a right click: the reactions spring in one after another, then Reply, the menu of
// everything else, and Delete for your own messages. It sits above the message when there is room, and below it when there is not.
function ActionSheet({
  anchor,
  mine,
  canDelete,
  onClose,
  onReact,
  onReply,
  onDelete,
  more,
}: {
  anchor: DOMRect
  mine: boolean
  canDelete: boolean
  onClose: () => void
  onReact: (emoji: string) => void
  onReply: () => void
  onDelete: () => void
  more: ReactNode
}) {
  const above = anchor.top > 170
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }
    // Scrolling moves the message away from where the sheet is pinned, so the sheet closes with it.
    window.addEventListener("keydown", onKey)
    window.addEventListener("scroll", onClose, { capture: true, passive: true })
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("scroll", onClose, { capture: true })
    }
  }, [onClose])
  const pill = "flex items-center gap-0.5 rounded-full bg-background p-1 shadow-[0_14px_36px_-12px_rgba(0,0,0,0.45)] ring-1 ring-black/[0.08]"
  return createPortal(
    <>
      <div aria-hidden="true" onPointerDown={onClose} className="fixed inset-0 z-40" />
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={SPRING_POP}
        style={{
          top: above ? anchor.top - 10 : anchor.bottom + 10,
          transformOrigin: `${mine ? "100%" : "0%"} ${above ? "100%" : "0%"}`,
          ...(mine ? { right: Math.max(12, window.innerWidth - anchor.right) } : { left: Math.max(12, anchor.left) }),
        }}
        className={cn("fixed z-50 flex flex-col gap-2", above && "-translate-y-full", mine ? "items-end" : "items-start")}
      >
        <div role="group" aria-label="Choose a reaction" className={cn(pill, "gap-0.5 px-1.5")}>
          {REACTIONS.map((emoji, index) => (
            <motion.button
              key={emoji}
              type="button"
              aria-label={`React with ${emoji}`}
              initial={{ opacity: 0, scale: 0.3, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ ...SPRING_POP, delay: 0.03 + index * 0.04 }}
              whileHover={{ scale: 1.2, y: -2 }}
              whileTap={{ scale: 0.88 }}
              onClick={() => onReact(emoji)}
              className="grid size-10 place-items-center rounded-full text-[22px] leading-none outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {emoji}
            </motion.button>
          ))}
        </div>
        <motion.div initial={{ opacity: 0, y: mine ? 6 : -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.12 }} className={pill}>
          <button
            type="button"
            aria-label="Reply"
            onClick={onReply}
            className="grid size-10 place-items-center rounded-full text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Reply className="size-[18px]" aria-hidden="true" />
          </button>
          {more}
          {canDelete ? (
            <button
              type="button"
              aria-label="Delete message"
              onClick={onDelete}
              className="grid size-10 place-items-center rounded-full text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Trash2 className="size-[18px]" aria-hidden="true" />
            </button>
          ) : null}
        </motion.div>
      </motion.div>
    </>,
    document.body
  )
}

function MessageRow({
  conversationId,
  message,
  onChange,
  fresh,
  showName,
  joinsPrev,
  canPin,
  selecting,
  picked,
  onPick,
  onSelectStart,
  onReport,
}: {
  conversationId: string
  message: MessageView
  onChange: (change: ThreadChange) => void
  // A message that arrived while the thread was open: its bubble rises in once.
  fresh: boolean
  showName: boolean
  joinsPrev: boolean
  canPin: boolean
  // Whether the thread is picking messages for a bulk action, and whether this one is picked.
  selecting: boolean
  picked: boolean
  onPick: () => void
  onSelectStart: () => void
  onReport: () => void
}) {
  const photoWidth = useImageWidth(1280)
  // The actions sheet, the spot it is pinned to, and the dialogs it opens.
  const [sheetOpen, setSheetOpen] = useState(false)
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [forwardOpen, setForwardOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  // When the reminder dialog was opened, so its quick times are worked out from that moment. Null while it is closed.
  const [reminderOpenedAt, setReminderOpenedAt] = useState<number | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  // A view-once photo or video this viewer has opened in this visit. Until they leave, it stays on screen.
  const [viewed, setViewed] = useState(false)
  const [pending, startTransition] = useTransition()
  // A new bubble of yours may be where a flight from the composer lands (components/app/send-flight.ts). It is held until the
  // flight claims it, so a photo shows only once its picture is in place.
  const bubbleRef = useRef<HTMLDivElement>(null)
  // The bubble and the reactions under it, held together until a flight lands.
  const columnRef = useRef<HTMLDivElement>(null)
  const metaRef = useRef<HTMLSpanElement>(null)
  // The hold timer, and where the pointer went down, so a move cancels the hold.
  const holdTimer = useRef<number | null>(null)
  const holdFrom = useRef<{ x: number; y: number } | null>(null)
  // A swipe toward the reply side, and whether a release now would reply.
  const swipe = useMotionValue(0)
  const swipeControls = useDragControls()
  const progress = useTransform(swipe, (value) => Math.min(1, Math.abs(value) / REPLY_SWIPE))
  const [armed, setArmed] = useState(false)
  useMotionValueEvent(swipe, "change", (value) => setArmed(Math.abs(value) >= REPLY_SWIPE))
  useEffect(() => {
    if (armed) navigator.vibrate?.(8)
  }, [armed])

  function cancelHold() {
    if (holdTimer.current !== null) window.clearTimeout(holdTimer.current)
    holdTimer.current = null
  }
  useEffect(() => cancelHold, [])

  useLayoutEffect(() => {
    const bubble = bubbleRef.current
    const column = columnRef.current
    if (message.mine && fresh && bubble && column) {
      receive(conversationId, bubble, bubble.querySelector<HTMLElement>("[data-flight-picture]"), column, () => comeOut(metaRef.current))
    }
    // Only the message as it arrived; later renders of the same row are not new arrivals.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A sender can change the words of a message for a short time after sending it. The menu asks the rule when it opens, so the
  // window is judged at that moment, and the server judges it again when the change is sent.
  const [editable, setEditable] = useState(false)
  function judgeEditable(): boolean {
    return (
      message.mine &&
      !message.deleted &&
      message.call === null &&
      message.timerChange === null &&
      editRefusal(
        {
          mine: message.mine,
          deleted: message.deleted,
          callStatus: null,
          timerChange: null,
          attachmentKind: message.attachment?.kind ?? null,
          viewOnce: message.viewOnce,
          createdAt: message.createdAt,
        },
        Date.now()
      ) === null
    )
  }
  // A view-once file, sealed or plain, is hidden until the viewer opens it.
  const viewOnceHidden = (message.mediaFile !== null || message.sealedAttachment?.kind === "media") && message.viewOnce && !message.mine && !viewed

  // The gestures: a finger or pen swipes the bubble toward its reply side, and a hold (or a right click) opens the actions. A mouse
  // drag selects text as it always does, so a mouse holds instead of swiping.
  const gestures = !selecting && !message.deleted && !editing

  function openSheet() {
    setAnchor(bubbleRef.current?.getBoundingClientRect() ?? null)
    setSheetOpen(true)
  }

  // While the actions are open, they follow the bubble's place: a bubble still settling (a photo arriving, a message that is
  // landing) is measured again each frame, so the actions sit beside it once it has stopped moving.
  useEffect(() => {
    if (!sheetOpen) return
    let frame = 0
    let last = ""
    const follow = () => {
      const rect = bubbleRef.current?.getBoundingClientRect()
      if (rect) {
        const key = `${rect.top},${rect.bottom},${rect.left},${rect.right}`
        if (key !== last) {
          last = key
          setAnchor(rect)
        }
      }
      frame = requestAnimationFrame(follow)
    }
    frame = requestAnimationFrame(follow)
    return () => cancelAnimationFrame(frame)
  }, [sheetOpen])

  function onPressStart(event: ReactPointerEvent<HTMLDivElement>) {
    if (!gestures) return
    if (event.pointerType !== "mouse") swipeControls.start(event)
    holdFrom.current = { x: event.clientX, y: event.clientY }
    cancelHold()
    holdTimer.current = window.setTimeout(() => {
      holdTimer.current = null
      navigator.vibrate?.(12)
      openSheet()
    }, HOLD_MS)
  }

  function onPressMove(event: ReactPointerEvent<HTMLDivElement>) {
    const from = holdFrom.current
    if (from && Math.hypot(event.clientX - from.x, event.clientY - from.y) > 8) cancelHold()
  }

  function onContextMenu(event: ReactMouseEvent<HTMLDivElement>) {
    if (!gestures) return
    event.preventDefault()
    cancelHold()
    openSheet()
  }

  // The keyboard reaches the same actions: Enter, Space, the Menu key or Shift+F10 on the bubble itself.
  function onBubbleKey(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!gestures || event.target !== event.currentTarget) return
    if (event.key === "Enter" || event.key === " " || event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
      event.preventDefault()
      openSheet()
    }
  }

  // Hands the message to the composer, which shows who is being answered and takes the focus.
  function startReply() {
    setSheetOpen(false)
    window.dispatchEvent(
      new CustomEvent("rhenko:reply-to", {
        detail: { conversationId, id: message.id, name: message.mine ? "yourself" : message.senderName, snippet: previewOf(message) },
      })
    )
  }

  function react(emoji: string) {
    setSheetOpen(false)
    startTransition(async () => {
      const result = await toggleReaction(message.id, emoji)
      if (!result.ok) toast.error(result.error)
    })
  }

  // Stars or unstars the message for this viewer alone.
  function toggleStar() {
    startTransition(async () => {
      const result = await toggleStarMessage(message.id)
      if (result.ok) {
        onChange({ starred: result.starred })
        toast.success(result.starred ? "Starred." : "Unstarred.")
      } else {
        toast.error(result.error)
      }
    })
  }

  // Pins the message for everyone in the chat, or unpins it.
  function togglePin() {
    startTransition(async () => {
      const result = await pinMessage(message.id, !message.pinned)
      if (!result.ok) toast.error(result.error)
      else toast.success(message.pinned ? "Unpinned." : "Pinned.")
    })
  }

  function clearReminder() {
    startTransition(async () => {
      const result = await cancelMessageReminder(message.id)
      if (!result.ok) toast.error(result.error)
      else toast.success("Reminder removed.")
    })
  }

  function startEdit() {
    setDraft(message.body)
    setEditing(true)
  }

  // Saves the new words. A message left as it was is simply closed.
  function saveEdit() {
    const body = draft.replace(/\r\n/g, "\n").trim()
    if (body === message.body) {
      setEditing(false)
      return
    }
    startTransition(async () => {
      // An encrypted message is sealed again on this device; a plain one is changed on the server.
      const sealed = message.sealed
      const result = sealed
        ? await editSealedMessage({ conversationId, id: message.id, envelope: sealed.envelope, wrap: sealed.wrap, file: sealed.file }, body)
        : await editMessage(message.id, draft)
      if (result.ok) {
        onChange({ body, editedAt: Date.now() })
        setEditing(false)
      } else {
        toast.error(result.error)
      }
    })
  }

  // Shows a view-once photo or video, and records that it was opened, so the server gives it to this person once.
  function openOnce() {
    startTransition(async () => {
      const result = await openViewOnce(message.id)
      if (result.ok) setViewed(true)
      else toast.error(result.error)
    })
  }

  // Removes the message from this viewer's own view. It stays for everyone else in the chat.
  function deleteForMe() {
    startTransition(async () => {
      const result = await hideMessageForMe(message.id)
      if (result.ok) onChange({ hidden: true })
      else toast.error(result.error)
    })
  }

  if (message.call) return <CallEvent message={message} />
  if (message.timerChange !== null) return <TimerEvent message={message} />

  // What the bubble holds decides where its time line sits and how much room it leaves around the content.
  const file = message.mediaFile
  // An encrypted photo is a picture like any other. Its file is opened on this device, so the server gives no file name for it.
  const sealedPicture = message.sealedAttachment?.kind === "media" && message.sealedAttachment.media.media === "image"
  const isPicture = sealedPicture || (file !== null && !isVoiceFile(file) && !isAudioFile(file) && !isVideoFile(file) && !isDocumentFile(file))
  const onPicture =
    isPicture &&
    !viewOnceHidden &&
    !editing &&
    !message.body &&
    !message.replyTo &&
    !message.forwarded &&
    !message.link &&
    !message.poll &&
    !message.post &&
    !message.postUnavailable
  const onText = !editing && Boolean(message.body)
  // A photo with words under it keeps the thin frame of a bare photo; the words get their own room inside it.
  const captioned = isPicture && !viewOnceHidden && onText
  const framed = onPicture || captioned
  const rowMeta = !message.deleted && !editing && !onText && !onPicture
  const compact = rowMeta && (file !== null || message.attachment !== null || message.sealedAttachment !== null || message.post !== null) && !message.poll
  const bubblePadding = framed ? "p-[3px]" : compact ? "p-1.5" : "px-3.5 py-2"
  const bubbleTone = message.mine
    ? "bg-dusk text-background [&_a:not([data-embed])]:text-background [&_a:not([data-embed])]:underline"
    : "bg-muted text-foreground"

  const moreMenu = (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) setEditable(judgeEditable())
        else setSheetOpen(false)
      }}
    >
      <DropdownMenuTrigger
        aria-label="More message options"
        className="grid size-10 place-items-center rounded-full text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      >
        <MoreHorizontal className="size-[18px]" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align={message.mine ? "end" : "start"} className="min-w-44">
        {editable ? (
          <DropdownMenuItem className={MENU_ITEM_PHONE} onClick={startEdit}>
            <Pencil className="size-4" aria-hidden="true" />
            Edit
          </DropdownMenuItem>
        ) : null}
        {message.viewOnce ? null : (
          <DropdownMenuItem className={MENU_ITEM_PHONE} disabled={pending} onClick={toggleStar}>
            {message.starred ? <StarOff className="size-4" aria-hidden="true" /> : <Star className="size-4" aria-hidden="true" />}
            {message.starred ? "Unstar" : "Star"}
          </DropdownMenuItem>
        )}
        {message.viewOnce ? null : (
          <DropdownMenuItem className={MENU_ITEM_PHONE} onClick={() => setForwardOpen(true)}>
            <Forward className="size-4" aria-hidden="true" />
            Forward
          </DropdownMenuItem>
        )}
        {canPin && !message.deleted && message.call === null && message.timerChange === null && !message.viewOnce ? (
          <DropdownMenuItem className={MENU_ITEM_PHONE} disabled={pending} onClick={togglePin}>
            {message.pinned ? <PinOff className="size-4" aria-hidden="true" /> : <Pin className="size-4" aria-hidden="true" />}
            {message.pinned ? "Unpin" : "Pin"}
          </DropdownMenuItem>
        ) : null}
        {!message.deleted && message.call === null && message.timerChange === null ? (
          <>
            <DropdownMenuItem className={MENU_ITEM_PHONE} onClick={() => setReminderOpenedAt(Date.now())}>
              <AlarmClock className="size-4" aria-hidden="true" />
              {message.reminderAt !== null ? "Change reminder" : "Remind me"}
            </DropdownMenuItem>
            {message.reminderAt !== null ? (
              <DropdownMenuItem className={MENU_ITEM_PHONE} disabled={pending} onClick={clearReminder}>
                <AlarmClockOff className="size-4" aria-hidden="true" />
                Cancel reminder
              </DropdownMenuItem>
            ) : null}
          </>
        ) : null}
        <DropdownMenuItem className={MENU_ITEM_PHONE} onClick={onSelectStart}>
          <ListChecks className="size-4" aria-hidden="true" />
          Select
        </DropdownMenuItem>
        {message.mine && !message.call && message.timerChange === null ? (
          <DropdownMenuItem className={MENU_ITEM_PHONE} onClick={() => setInfoOpen(true)}>
            <Info className="size-4" aria-hidden="true" />
            Message info
          </DropdownMenuItem>
        ) : null}
        {!message.mine && !message.deleted && message.call === null && message.timerChange === null ? (
          <DropdownMenuItem className={MENU_ITEM_PHONE} onClick={onReport}>
            <Flag className="size-4" aria-hidden="true" />
            Report
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem className={MENU_ITEM_PHONE} disabled={pending} onClick={deleteForMe}>
          <EyeOff className="size-4" aria-hidden="true" />
          Delete for me
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  return (
    <div
      data-message-id={message.id}
      // While picking messages, a tap anywhere on the row picks it. Its contents don't take the tap, so links and buttons don't fire.
      onClick={selecting ? onPick : undefined}
      className={cn(
        "group flex flex-col gap-1 px-4",
        joinsPrev ? "pt-[3px]" : "pt-3",
        message.mine ? "items-end" : "items-start",
        selecting && "cursor-pointer rounded-xl py-1 transition-colors",
        selecting && picked && "bg-dusk/10"
      )}
    >
      {showName ? <span className="px-1 text-xs text-muted-foreground">{message.senderName}</span> : null}
      <div className={cn("relative flex items-end gap-2", message.mine && "flex-row-reverse")}>
        {selecting ? (
          <button
            type="button"
            aria-pressed={picked}
            aria-label={picked ? "Unselect message" : "Select message"}
            onClick={(event) => {
              event.stopPropagation()
              onPick()
            }}
            className={cn(
              "grid size-6 shrink-0 place-items-center self-center rounded-full border-2 transition-colors",
              picked ? "border-dusk bg-dusk text-background" : "border-foreground/40"
            )}
          >
            {picked ? <Check className="size-3.5" aria-hidden="true" /> : null}
          </button>
        ) : null}
        {gestures ? <SwipeCue progress={progress} armed={armed} mine={message.mine} /> : null}
        <div ref={columnRef} className={cn("flex min-w-0 max-w-[min(78%,30rem)] flex-col", message.mine ? "items-end" : "items-start")}>
          <motion.div
            drag={gestures ? "x" : false}
            dragControls={swipeControls}
            dragListener={false}
            dragDirectionLock
            dragSnapToOrigin
            dragElastic={0.12}
            dragConstraints={message.mine ? { left: -SWIPE_MAX, right: 0 } : { left: 0, right: SWIPE_MAX }}
            onDragStart={cancelHold}
            onDragEnd={(_event, info) => {
              if (Math.abs(info.offset.x) >= REPLY_SWIPE) startReply()
            }}
            style={{ x: swipe, zIndex: sheetOpen ? 50 : undefined }}
            className="relative flex max-w-full min-w-0 touch-pan-y flex-col"
          >
            <motion.div
              ref={bubbleRef}
              tabIndex={gestures ? 0 : undefined}
              onPointerDown={onPressStart}
              onPointerMove={onPressMove}
              onPointerUp={cancelHold}
              onPointerCancel={cancelHold}
              onPointerLeave={cancelHold}
              onContextMenu={onContextMenu}
              onKeyDown={onBubbleKey}
              // A message of theirs rises in as it arrives, growing out of its own corner, with the spring of Parley's bubbles. Yours
              // comes in on its flight from the composer, or not at all, so the text does not rise a second time after it lands.
              initial={fresh && !message.mine ? { opacity: 0, y: 10, scale: 0.86 } : false}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={SPRING_BUBBLE}
              style={{ transformOrigin: message.mine ? "100% 100%" : "0% 100%" }}
              className={cn(
                BUBBLE_SHAPE,
                bubblePadding,
                bubbleTone,
                !joinsPrev && (message.mine ? TAIL_MINE : TAIL_THEIRS),
                "[-webkit-touch-callout:none]",
                selecting && "pointer-events-none",
                message.deleted && "italic opacity-70"
              )}
            >
              {message.deleted ? (
                <span>This message was deleted.</span>
              ) : (
                <>
                  {message.forwarded ? (
                    <p className="flex items-center gap-1 text-xs italic opacity-80">
                      <Forward className="size-3" aria-hidden="true" />
                      Forwarded
                    </p>
                  ) : null}
                  {message.replyTo ? (
                    <button
                      type="button"
                      onClick={() => jumpTo(message.replyTo?.id ?? "")}
                      className={cn(
                        "block w-full rounded-xl border-l-2 px-2.5 py-1.5 text-left text-[13px] leading-snug outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        message.mine ? "border-background/70 bg-background/15 text-background" : "border-foreground/40 bg-background text-foreground"
                      )}
                    >
                      <span className="block truncate font-semibold">{message.replyTo.senderName}</span>
                      <span className={cn("block truncate", message.mine ? "text-background/80" : "text-muted-foreground")}>
                        {message.replyTo.deleted ? "This message was deleted." : message.replyTo.snippet}
                      </span>
                    </button>
                  ) : null}
                  {viewOnceHidden ? (
                    <ViewOnceTile video={isVideoFile(file ?? "")} opened={message.viewOpened} pending={pending} onOpen={openOnce} />
                  ) : message.sealedAttachment?.kind === "media" ? (
                    <SealedAttachment
                      conversationId={conversationId}
                      messageId={message.id}
                      media={message.sealedAttachment.media}
                      onLoad={message.mine && fresh ? followLatest : undefined}
                      framed={framed}
                      wide={onPicture}
                      time={onPicture ? <Meta message={message} place="picture" refer={metaRef} /> : null}
                    />
                  ) : file && isVoiceFile(file) ? (
                    <audio controls preload="metadata" src={`/media/${file}`} aria-label="Voice message" className="block h-10 w-[240px] max-w-full" />
                  ) : file && isVideoFile(file) ? (
                    <div className="w-full max-w-[300px] overflow-hidden rounded-xl">
                      <VideoPlayer src={`/media/${file}`} label="Shared video" maxHeight="320px" />
                    </div>
                  ) : file && isAudioFile(file) ? (
                    <audio controls preload="metadata" src={`/media/${file}`} aria-label="Audio file" className="block h-10 w-[260px] max-w-full" />
                  ) : file && isDocumentFile(file) ? (
                    <DocumentCard
                      file={file}
                      name={message.attachment?.kind === "document" ? message.attachment.name : "File"}
                      size={message.attachment?.kind === "document" ? message.attachment.size : 0}
                    />
                  ) : file ? (
                    // A bare photo has a set width, so its bubble and its picture agree on the room they take, at any phone width.
                    <span className={cn("relative block max-w-full overflow-hidden", onPicture ? "w-[16.5rem]" : "w-fit", framed ? "rounded-[17px]" : "rounded-[14px]")}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/media/${file}?w=${photoWidth}`}
                        alt={message.attachment?.kind === "scan" ? "Scan" : "Shared photo"}
                        data-flight-picture
                        loading={message.mine && fresh ? "eager" : "lazy"}
                        onLoad={message.mine && fresh ? followLatest : undefined}
                        decoding="async"
                        className={cn("max-h-72 max-w-full object-cover", onPicture && "w-full", framed ? "rounded-[17px]" : "rounded-[14px] ring-1 ring-black/[0.06]")}
                      />
                      {message.attachment?.kind === "scan" ? (
                        <span className="absolute bottom-2 left-2 rounded-md bg-black/70 px-1.5 py-0.5 text-xs font-semibold text-white">Scan</span>
                      ) : null}
                      {onPicture ? <Meta message={message} place="picture" refer={metaRef} /> : null}
                    </span>
                  ) : null}
                  {message.attachment?.kind === "contact" ? <ContactCard user={message.contact} /> : null}
                  {message.sealedAttachment?.kind === "contact" ? <ContactCard user={message.sealedAttachment.user} /> : null}
                  {message.sealedAttachment?.kind === "location" ? (
                    <LocationCard lat={message.sealedAttachment.lat} lng={message.sealedAttachment.lng} />
                  ) : null}
                  {message.attachment?.kind === "location" ? <LocationCard lat={message.attachment.lat} lng={message.attachment.lng} /> : null}
                  {editing ? (
                    <EditBox value={draft} onChange={setDraft} onSave={saveEdit} onCancel={() => setEditing(false)} pending={pending} />
                  ) : message.body ? (
                    <div className={cn(captioned && "px-2 pt-1 pb-1")}>
                      <ChatText text={message.body} message={message} refer={metaRef} />
                      {/* Empty unless a translate control shows, so it adds no space under the words. A sealed message is never
                          translated: translating sends its words to the translation service, and the server must not see them. */}
                      <div className="relative z-10 empty:hidden">
                        {message.sealed ? null : <TranslateControl kind="message" id={message.id} lang={message.lang} />}
                      </div>
                    </div>
                  ) : null}
                  {message.link ? <LinkCard preview={message.link} className="mt-0 w-72" /> : null}
                  {message.poll ? <ChatPollView messageId={message.id} poll={message.poll} /> : null}
                  {message.post ? (
                    <Link
                      href={`/${message.post.author.handle}/status/${message.post.id}`}
                      data-embed=""
                      className="block rounded-xl border border-border bg-background p-3 text-foreground no-underline"
                    >
                      <span className="text-sm font-semibold">{message.post.author.name}</span>
                      {message.post.body ? <span className="mt-1 line-clamp-3 text-sm">{message.post.body}</span> : null}
                    </Link>
                  ) : null}
                  {message.postUnavailable ? (
                    <p className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
                      This post is unavailable.
                    </p>
                  ) : null}
                  {rowMeta ? <Meta message={message} place="row" refer={metaRef} /> : null}
                </>
              )}
            </motion.div>
          </motion.div>

          {message.reactions.length > 0 ? (
            <div className={cn("mt-1 flex flex-wrap gap-1", message.mine ? "justify-end" : "justify-start", selecting && "pointer-events-none")}>
              {message.reactions.map((reaction, index) => (
                <motion.button
                  key={reaction.emoji}
                  type="button"
                  disabled={pending}
                  aria-pressed={reaction.mine}
                  aria-label={`${reaction.emoji} ${reaction.count}${reaction.mine ? ", yours" : ""}`}
                  onClick={() => react(reaction.emoji)}
                  initial={{ opacity: 0, scale: 0.4, y: -6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ ...SPRING_POP, delay: index * 0.05 }}
                  className={cn(
                    "flex items-center gap-1 rounded-full border px-2 py-0.5 text-[13px] tabular-nums shadow-[0_2px_6px_-2px_rgba(0,0,0,0.2)]",
                    reaction.mine ? "border-dusk bg-dusk/10" : "border-border bg-background"
                  )}
                >
                  <span className="text-[15px] leading-none">{reaction.emoji}</span>
                  <span className="font-medium">{reaction.count}</span>
                </motion.button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {gestures && sheetOpen && anchor ? (
        <ActionSheet
          anchor={anchor}
          mine={message.mine}
          canDelete={message.mine}
          onClose={() => setSheetOpen(false)}
          onReact={react}
          onReply={startReply}
          onDelete={() => {
            setSheetOpen(false)
            setDeleteOpen(true)
          }}
          more={moreMenu}
        />
      ) : null}
      {message.mine ? (
        <ConfirmDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title="Delete this message?"
          description="It's removed for everyone in the conversation."
          confirmLabel="Delete"
          action={() => deleteMessage(message.id)}
        />
      ) : null}
      {forwardOpen ? (
        <ForwardDialog
          messageId={message.id}
          sealed={message.sealed ? { conversationId, id: message.id, envelope: message.sealed.envelope, wrap: message.sealed.wrap, file: message.sealed.file } : null}
          onOpenChange={setForwardOpen}
        />
      ) : null}
      {infoOpen ? <MessageInfoDialog messageId={message.id} onOpenChange={setInfoOpen} /> : null}
      {reminderOpenedAt !== null ? (
        <ReminderDialog
          messageId={message.id}
          openedAt={reminderOpenedAt}
          onOpenChange={(open) => {
            if (!open) setReminderOpenedAt(null)
          }}
        />
      ) : null}
    </div>
  )
}
