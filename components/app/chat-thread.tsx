"use client"

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react"
import Link from "@/components/app/link"
import { AlarmClock, AlarmClockOff, Check, Eye, EyeOff, Forward, Info, ListChecks, MoreHorizontal, Pin, PinOff, PhoneIncoming, PhoneMissed, PhoneOff, PhoneOutgoing, Pencil, Reply, SmilePlus, Star, StarOff, Timer, TimerOff, Trash2, Users } from "lucide-react"
import { toast } from "sonner"
import { cancelMessageReminder, deleteMessage, editMessage, hideMessageForMe, loadEarlierMessages, openViewOnce, pinMessage, toggleReaction, toggleStarMessage } from "@/actions/messages"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { ForwardDialog } from "@/components/app/forward-dialog"
import { MessageInfoDialog } from "@/components/app/message-info-dialog"
import { ReminderDialog } from "@/components/app/reminder-dialog"
import { THREAD_CHANGE_EVENT, useSelection, type ThreadChangeDetail } from "@/components/app/chat-selection"
import { MENU_ITEM_PHONE } from "@/components/app/overlay-sizes"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { removePending, usePending } from "@/components/app/pending-messages"
import { PostBody } from "@/components/app/post-body"
import { ContactCard, DocumentCard, LocationCard } from "@/components/app/attachment-view"
import { ChatPollView } from "@/components/app/chat-poll"
import { LinkCard } from "@/components/app/link-card"
import { VideoPlayer } from "@/components/app/video-player"
import { TranslateControl } from "@/components/app/translate-control"
import { LocalTime } from "@/components/app/time-text"
import { callSummary } from "@/lib/format"
import { isAudioFile, isDocumentFile, isVideoFile, isVoiceFile } from "@/lib/media-names"
import { quoteLabel } from "@/lib/message-attachments"
import { editRefusal } from "@/lib/chat-message-rules"
import { isExpired, nextExpiry, timerLine } from "@/lib/message-timers"
import type { MessageView } from "@/lib/data"
import { REACTIONS } from "@/lib/rules"
import { cn } from "@/lib/utils"

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
}) {
  const selection = useSelection()
  const endRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const anchor = useRef<{ id: string; top: number } | null>(null)
  const [typing, setTyping] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const [earlier, setEarlier] = useState<MessageView[]>([])
  const [atStart, setAtStart] = useState(false)
  const [loading, startLoading] = useTransition()
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
  const listed = [...earlier.filter((message) => !pageIds.has(message.id)), ...messages]
    .filter((message) => !changes[message.id]?.hidden)
    .map((message) => withChange(message, changes[message.id]))
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

  const lastOwn = [...shown].reverse().find((m) => m.mine && !m.call && m.timerChange === null)

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
        const next = shown[index + 1]
        return (
          <MessageRow
            key={message.id}
            conversationId={conversationId}
            message={message}
            onChange={(change) => setChanges((current) => ({ ...current, [message.id]: { ...current[message.id], ...change } }))}
            showSeen={message.id === lastOwn?.id && message.seen}
            // Messages from the same sender in quick succession stack into one run.
            joinsPrev={sameRun(previous, message)}
            joinsNext={sameRun(message, next)}
            // In a group, name the sender once at the start of each run of their messages.
            showName={showNames && !message.mine && !sameRun(previous, message)}
            canPin={canPin}
            selecting={selection?.picked != null}
            picked={selection?.picked?.has(message.id) ?? false}
            onPick={() => selection?.toggle(message.id, message.starred)}
            onSelectStart={() => selection?.start(message.id, message.starred)}
          />
        )
      })}
      {waiting.map((item) => (
        <PendingBubble key={item.key} body={item.body} />
      ))}
      {typing ? <p className="px-4 text-sm text-muted-foreground">{typing} is typing…</p> : null}
      {hasNewer ? (
        <div className="flex justify-center px-4 pt-4">
          <Link href={`/messages/${conversationId}`} className="glass inline-flex h-9 items-center rounded-full px-4 text-[14px] font-medium text-foreground transition-colors hover:bg-foreground/5">
            Jump to the latest messages
          </Link>
        </div>
      ) : null}
      {/* The margin is the sticky composer, so the newest message clears it when the thread scrolls to the end. */}
      <div ref={endRef} className="scroll-mb-[88px] lg:scroll-mb-[80px]" />
    </div>
  )
}

// A message being sent: it shows at once, a little faded, until the saved copy arrives in the thread.
function PendingBubble({ body }: { body: string }) {
  return (
    <div className="flex flex-col items-end gap-1 px-4 pt-3 animate-in fade-in slide-in-from-bottom-1 duration-200">
      <div className="max-w-[78%] whitespace-pre-wrap break-words rounded-[20px] bg-dusk px-3.5 py-2 text-[15px] leading-relaxed text-background opacity-70">
        {body}
      </div>
      <span className="text-xs text-muted-foreground" aria-live="polite">
        Sending…
      </span>
    </div>
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

function MessageRow({
  conversationId,
  message,
  onChange,
  showSeen,
  showName,
  joinsPrev,
  joinsNext,
  canPin,
  selecting,
  picked,
  onPick,
  onSelectStart,
}: {
  conversationId: string
  message: MessageView
  onChange: (change: ThreadChange) => void
  showSeen: boolean
  showName: boolean
  joinsPrev: boolean
  joinsNext: boolean
  canPin: boolean
  // Whether the thread is picking messages for a bulk action, and whether this one is picked.
  selecting: boolean
  picked: boolean
  onPick: () => void
  onSelectStart: () => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  // Hover does not exist on a phone, so a tap on the bubble shows its actions instead.
  const [revealed, setRevealed] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [forwardOpen, setForwardOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  // When the reminder dialog was opened, so its quick times are worked out from that moment. Null while it is closed.
  const [reminderOpenedAt, setReminderOpenedAt] = useState<number | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  // A view-once photo or video this viewer has opened in this visit. Until they leave, it stays on screen.
  const [viewed, setViewed] = useState(false)
  const [pending, startTransition] = useTransition()

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
  const viewOnceHidden = message.mediaFile !== null && message.viewOnce && !message.mine && !viewed

  function toggleOnTouch() {
    if (selecting || message.deleted || editing) return
    if (window.matchMedia("(pointer: coarse)").matches) setRevealed((open) => !open)
  }

  // Hands the message to the composer, which shows who is being answered and takes the focus.
  function startReply() {
    setRevealed(false)
    window.dispatchEvent(
      new CustomEvent("rhenko:reply-to", {
        detail: { conversationId, id: message.id, name: message.mine ? "yourself" : message.senderName, snippet: previewOf(message) },
      })
    )
  }

  function react(emoji: string) {
    setPickerOpen(false)
    startTransition(async () => {
      const result = await toggleReaction(message.id, emoji)
      if (!result.ok) toast.error(result.error)
    })
  }

  // Stars or unstars the message for this viewer alone.
  function toggleStar() {
    setRevealed(false)
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
    setRevealed(false)
    startTransition(async () => {
      const result = await pinMessage(message.id, !message.pinned)
      if (!result.ok) toast.error(result.error)
      else toast.success(message.pinned ? "Unpinned." : "Pinned.")
    })
  }

  function clearReminder() {
    setRevealed(false)
    startTransition(async () => {
      const result = await cancelMessageReminder(message.id)
      if (!result.ok) toast.error(result.error)
      else toast.success("Reminder removed.")
    })
  }

  function startEdit() {
    setRevealed(false)
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
      const result = await editMessage(message.id, draft)
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
    setRevealed(false)
    startTransition(async () => {
      const result = await hideMessageForMe(message.id)
      if (result.ok) onChange({ hidden: true })
      else toast.error(result.error)
    })
  }

  if (message.call) return <CallEvent message={message} />
  if (message.timerChange !== null) return <TimerEvent message={message} />

  // The marks a message carries. They sit on its time line, or on a line of their own when it is in the middle of a run.
  const marks = (
    <>
      {message.viewOnce ? (
        <>
          <Eye className="mr-1 inline size-3 align-[-2px]" aria-hidden="true" />
          <span className="sr-only">View once, </span>
        </>
      ) : null}
      {message.starred ? (
        <>
          <Star className="mr-1 inline size-3 align-[-2px]" aria-hidden="true" />
          <span className="sr-only">Starred, </span>
        </>
      ) : null}
      {message.pinned ? (
        <>
          <Pin className="mr-1 inline size-3 align-[-2px]" aria-hidden="true" />
          <span className="sr-only">Pinned, </span>
        </>
      ) : null}
      {message.reminderAt !== null ? (
        <>
          <AlarmClock className="mr-1 inline size-3 align-[-2px]" aria-hidden="true" />
          <span className="sr-only">Reminder set, </span>
        </>
      ) : null}
    </>
  )
  const hasOwnMarks = message.viewOnce || message.starred || message.pinned || message.reminderAt !== null

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
      {showName ? <span className="text-xs text-muted-foreground">{message.senderName}</span> : null}
      <div className={cn("flex items-end gap-2", message.mine && "flex-row-reverse")}>
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
        <div
          onClick={toggleOnTouch}
          className={cn(
            "flex max-w-[min(78%,30rem)] flex-col gap-2 rounded-[22px] px-3.5 py-2.5 text-[15px] leading-relaxed",
            selecting && "pointer-events-none",
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
                <ViewOnceTile video={isVideoFile(message.mediaFile ?? "")} opened={message.viewOpened} pending={pending} onOpen={openOnce} />
              ) : message.mediaFile && isVoiceFile(message.mediaFile) ? (
                <audio controls preload="metadata" src={`/media/${message.mediaFile}`} aria-label="Voice message" className="block h-10 w-[240px] max-w-full" />
              ) : message.mediaFile && isVideoFile(message.mediaFile) ? (
                <div className="w-full max-w-[300px] overflow-hidden rounded-xl">
                  <VideoPlayer src={`/media/${message.mediaFile}`} label="Shared video" maxHeight="320px" />
                </div>
              ) : message.mediaFile && isAudioFile(message.mediaFile) ? (
                <audio controls preload="metadata" src={`/media/${message.mediaFile}`} aria-label="Audio file" className="block h-10 w-[260px] max-w-full" />
              ) : message.mediaFile && isDocumentFile(message.mediaFile) ? (
                <DocumentCard
                  file={message.mediaFile}
                  name={message.attachment?.kind === "document" ? message.attachment.name : "File"}
                  size={message.attachment?.kind === "document" ? message.attachment.size : 0}
                  mine={message.mine}
                />
              ) : message.mediaFile ? (
                <span className="relative block w-fit max-w-full">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/media/${message.mediaFile}?w=1280`} alt={message.attachment?.kind === "scan" ? "Scan" : "Shared photo"} loading="lazy" decoding="async" className="max-h-72 max-w-full rounded-xl object-cover" />
                  {message.attachment?.kind === "scan" ? (
                    <span className="absolute bottom-2 left-2 rounded-md bg-black/70 px-1.5 py-0.5 text-xs font-semibold text-white">Scan</span>
                  ) : null}
                </span>
              ) : null}
              {message.attachment?.kind === "contact" ? <ContactCard user={message.contact} mine={message.mine} /> : null}
              {message.attachment?.kind === "location" ? (
                <LocationCard lat={message.attachment.lat} lng={message.attachment.lng} mine={message.mine} />
              ) : null}
              {editing ? (
                <EditBox value={draft} onChange={setDraft} onSave={saveEdit} onCancel={() => setEditing(false)} pending={pending} />
              ) : message.body ? (
                <>
                  <PostBody text={message.body} className="text-[15px]" />
                  <div className="relative z-10">
                    <TranslateControl kind="message" id={message.id} lang={message.lang} />
                  </div>
                </>
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
              {message.editedAt !== null ? <span className="-mt-1 self-end text-xs leading-none opacity-70">Edited</span> : null}
            </>
          )}
        </div>

        {!message.deleted && !selecting ? (
          <div className={cn("flex items-center gap-0.5 pb-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100", (pickerOpen || revealed || menuOpen) && "opacity-100")}>
            <button type="button" aria-label="Reply" title="Reply" onClick={startReply} className="grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-muted">
              <Reply className="size-4" />
            </button>
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
            <DropdownMenu
              onOpenChange={(open) => {
                setMenuOpen(open)
                if (open) setEditable(judgeEditable())
              }}
            >
              <DropdownMenuTrigger aria-label="More message options" className="grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-muted">
                <MoreHorizontal className="size-4" aria-hidden="true" />
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
                <DropdownMenuItem
                  className={MENU_ITEM_PHONE}
                  onClick={() => {
                    setRevealed(false)
                    onSelectStart()
                  }}
                >
                  <ListChecks className="size-4" aria-hidden="true" />
                  Select
                </DropdownMenuItem>
                {message.mine && !message.call && message.timerChange === null ? (
                  <DropdownMenuItem className={MENU_ITEM_PHONE} onClick={() => setInfoOpen(true)}>
                    <Info className="size-4" aria-hidden="true" />
                    Message info
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem className={MENU_ITEM_PHONE} disabled={pending} onClick={deleteForMe}>
                  <EyeOff className="size-4" aria-hidden="true" />
                  Delete for me
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
        <div className={cn("flex flex-wrap gap-1", selecting && "pointer-events-none")}>
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
          {marks}
          {message.expiresAt !== null ? (
            <>
              <Timer className="mr-1 inline size-3 align-[-2px]" aria-hidden="true" />
              <span className="sr-only">Disappearing message, </span>
            </>
          ) : null}
          <LocalTime at={message.createdAt} variant="clock" />
        </p>
      ) : hasOwnMarks ? (
        <p className="text-xs text-muted-foreground">{marks}</p>
      ) : null}
      {forwardOpen ? <ForwardDialog messageId={message.id} onOpenChange={setForwardOpen} /> : null}
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
