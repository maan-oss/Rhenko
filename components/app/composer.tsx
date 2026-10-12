"use client"

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, useTransition, type ChangeEvent, type FormEvent, type KeyboardEvent, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { motion } from "motion/react"
import { CalendarClock, ImageIcon, ListChecks, Plus, Save, Trash2, X } from "lucide-react"
import { toast } from "sonner"
import { createPost, undoPost } from "@/actions/posts"
import { Avatar, type AvatarUser } from "@/components/app/avatar"
import { EmojiPicker } from "@/components/app/emoji-picker"
import { ReplyPicker } from "@/components/app/reply-picker"
import { fullTimestamp, pluralize } from "@/lib/format"
import {
  MAX_ALT,
  MAX_IMAGE_BYTES,
  MAX_IMAGES,
  MAX_POLL_OPTION,
  MAX_POST,
  MAX_VIDEO_BYTES,
  POLL_DURATIONS,
  POLL_MAX_OPTIONS,
  POLL_MIN_OPTIONS,
  SCHEDULE_MAX_AHEAD_MS,
  UNDO_WINDOW_MS,
  countChars,
  validateSchedule,
  type ReplySetting,
} from "@/lib/rules"
import { cn } from "@/lib/utils"

// The composer: text, optional media or a poll, who can reply, and when it goes out.
// Post sends now, Schedule waits for a time, and Save draft keeps it for later.
// A reply takes its reply setting from the post it answers, so a reply has no "Who can reply" choice, no schedule and no draft.

type ComposerProps = {
  viewer: AvatarUser
  replyToId?: string
  quoteOfId?: string
  placeholder: string
  id?: string
  compact?: boolean
  autoFocus?: boolean
  onPosted?: () => void
}

// A picture or video chosen for the post. Images and videos both carry a description for people who can't see them.
type Attachment = {
  key: string
  file: File
  kind: "image" | "video"
  alt: string
  altOpen: boolean
}

// The day a schedule starts from, and the first and last days the date field offers (the server's limits, in local days).
type Schedule = { date: string; time: string; min: string; max: string }

type Suggestion = { kind: "user"; handle: string; name: string; avatarFile: string | null; id: string } | { kind: "tag"; tag: string }

const DURATION_LABELS: Record<number, string> = {
  5: "5 minutes",
  30: "30 minutes",
  60: "1 hour",
  360: "6 hours",
  1440: "1 day",
  4320: "3 days",
  10080: "7 days",
}

// Quarter-hour steps, written the way the app writes times everywhere else.
const TIME_OPTIONS = Array.from({ length: 96 }, (_, index) => {
  const hour = Math.floor(index / 4)
  const minute = (index % 4) * 15
  const twelve = hour % 12 === 0 ? 12 : hour % 12
  return {
    value: `${pad(hour)}:${pad(minute)}`,
    label: `${twelve}:${pad(minute)} ${hour < 12 ? "AM" : "PM"}`,
  }
})

const POLL_DEFAULT_MINUTES = 1440
// Controls are 40px tall on a phone and smaller on a computer.
// Pills carry their own surface (glass, or metal when active), so the base has no colour or ring.
const PILL =
  "inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-8"
const FIELD = "h-10 rounded-full border border-border bg-background px-3 outline-none transition-colors focus:border-foreground sm:h-9"
// The reply picker and the emoji list are components of their own, so their phone sizes are set from here: 40px buttons, and
// an emoji list that opens from the toolbar's left edge so it stays on the screen. The picker's trigger is the one button
// that opens a dialog.
const REPLY_PICKER_PHONE = "max-sm:[&_button[aria-haspopup=dialog]]:size-10"
const EMOJI_PHONE =
  "max-sm:static max-sm:[&>button]:size-10 max-sm:[&_[role=dialog]]:w-[278px] max-sm:[&_[role=dialog]_button]:size-10 sm:[&>button]:size-8"
// The emoji list opens upward. Near the top of the page there is no room above the toolbar, so it opens downward.
const EMOJI_BELOW = "[&_[role=dialog]]:top-11 [&_[role=dialog]]:bottom-auto"
const EMOJI_LIST_HEIGHT = 300

function pad(value: number): string {
  return String(value).padStart(2, "0")
}

function localDate(at: Date): string {
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`
}

// The date and time a schedule starts from: tomorrow at nine, in the viewer's own time zone.
function newSchedule(): Schedule {
  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  return { date: localDate(tomorrow), time: "09:00", min: localDate(now), max: localDate(new Date(now.getTime() + SCHEDULE_MAX_AHEAD_MS)) }
}

// Why the server would refuse this time, judged by the clock as it is now, or null when it would accept it.
function scheduleProblem(at: number): string | null {
  return validateSchedule(at, Date.now())
}

function scheduledMs(date: string, time: string): number | null {
  if (!date || !time) return null
  const [year, month, day] = date.split("-").map(Number)
  const [hour, minute] = time.split(":").map(Number)
  const ms = new Date(year, month - 1, day, hour, minute, 0, 0).getTime()
  return Number.isFinite(ms) ? ms : null
}

// Each chosen file has one preview address, shared by whatever shows it and released when the last of those goes.
// A page kept in the background lets go of its previews and takes them again when it comes back, so a preview never
// points at an address that has been released.
const previewUrls = new Map<File, { url: string; holders: number }>()

function noPreview(): string | null {
  return null
}

function usePreview(file: File): string | null {
  const subscribe = useCallback(
    (changed: () => void) => {
      let entry = previewUrls.get(file)
      const created = entry === undefined
      if (!entry) {
        entry = { url: URL.createObjectURL(file), holders: 0 }
        previewUrls.set(file, entry)
      }
      entry.holders += 1
      if (created) changed()
      return () => {
        const held = previewUrls.get(file)
        if (!held) return
        held.holders -= 1
        if (held.holders <= 0) {
          URL.revokeObjectURL(held.url)
          previewUrls.delete(file)
        }
      }
    },
    [file]
  )
  const current = useCallback(() => previewUrls.get(file)?.url ?? null, [file])
  return useSyncExternalStore(subscribe, current, noPreview)
}

// A toolbar icon. Hover shows a faint tint, like the close control on the America.gov menu.
function ToolButton({
  label,
  hint,
  onClick,
  disabled = false,
  pressed = false,
  children,
}: {
  label: string
  hint?: string
  onClick: () => void
  disabled?: boolean
  pressed?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={pressed || undefined}
      title={disabled && hint ? hint : label}
      className={cn(
        "grid size-10 place-items-center rounded-full text-foreground transition-colors duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent sm:size-8",
        pressed && "bg-foreground/5"
      )}
    >
      {children}
    </button>
  )
}

function CountRing({ progress, over }: { progress: number; over: boolean }) {
  const radius = 9
  const circumference = 2 * Math.PI * radius
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <circle cx={11} cy={11} r={radius} fill="none" strokeWidth={2} className="stroke-border" />
      <motion.circle
        cx={11}
        cy={11}
        r={radius}
        fill="none"
        strokeWidth={2}
        strokeDasharray={circumference}
        transform="rotate(-90 11 11)"
        className={over ? "stroke-destructive" : "stroke-foreground"}
        animate={{ strokeDashoffset: circumference * (1 - progress) }}
        initial={false}
        transition={{ duration: 0.25, ease: "easeOut" }}
      />
    </svg>
  )
}

// One picture or video with its remove control and its ALT control. Photos and videos take the same description, and both
// say what they show to people who can't see them. On a video the ALT control sits at the top, clear of the player's controls.
function MediaTile({ item, onRemove, onPatch }: { item: Attachment; onRemove: () => void; onPatch: (patch: Partial<Attachment>) => void }) {
  const url = usePreview(item.file)
  const altId = useId()
  const video = item.kind === "video"
  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-muted">
        {url === null ? (
          <div className="aspect-video w-full" aria-hidden="true" />
        ) : video ? (
          <video src={url} muted playsInline controls preload="metadata" className="max-h-72 w-full" aria-label={item.alt || "Selected video"} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={item.alt || "Selected image"} className="max-h-72 w-full object-cover" />
        )}
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove media"
          className="glass absolute top-2 right-2 grid size-10 place-items-center rounded-full text-foreground transition-colors duration-200 hover:bg-foreground/5 sm:size-8"
        >
          <X className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => onPatch({ altOpen: !item.altOpen })}
          aria-expanded={item.altOpen}
          aria-controls={item.altOpen ? altId : undefined}
          title={item.alt ? "Edit alt text" : "Add alt text"}
          className={cn(
            "absolute left-2 inline-flex items-center justify-center rounded-full px-2.5 text-[12px] font-semibold transition-colors duration-200 max-sm:h-10 max-sm:min-w-10 max-sm:text-[13px] sm:h-6",
            video ? "top-2" : "bottom-2",
            item.alt ? "metal" : "glass text-foreground"
          )}
        >
          ALT
        </button>
      </div>
      {item.altOpen ? (
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="text-muted-foreground">Describe this for people who can&apos;t see it</span>
          <textarea
            id={altId}
            value={item.alt}
            maxLength={MAX_ALT}
            rows={2}
            onChange={(event) => onPatch({ alt: event.target.value })}
            className="resize-none rounded-xl border border-border bg-background p-2.5 text-sm outline-none transition-colors focus:border-foreground"
          />
        </label>
      ) : null}
    </div>
  )
}

// The @ or # word being typed just before the caret, if any.
function tokenBefore(text: string, caret: number): { token: string; start: number } | null {
  const match = /(^|\s)([@#][\p{L}\p{N}_]*)$/u.exec(text.slice(0, caret))
  if (!match) return null
  return { token: match[2], start: caret - match[2].length }
}

export function Composer({ viewer, replyToId, quoteOfId, placeholder, id, compact = false, autoFocus = false, onPosted }: ComposerProps) {
  const router = useRouter()
  const [text, setText] = useState("")
  const [caret, setCaret] = useState(0)
  const [media, setMedia] = useState<Attachment[]>([])
  const [poll, setPoll] = useState(false)
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""])
  const [pollMinutes, setPollMinutes] = useState<number>(POLL_DEFAULT_MINUTES)
  const [replySetting, setReplySetting] = useState<ReplySetting>("everyone")
  const [sensitive, setSensitive] = useState(false)
  const [scheduling, setScheduling] = useState(false)
  const [schedule, setSchedule] = useState<Schedule>({ date: "", time: "09:00", min: "", max: "" })
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [active, setActive] = useState(0)
  // Thread parts after the first. Each one posts as a reply to the part before it.
  const [extra, setExtra] = useState<string[]>([])
  const [intent, setIntent] = useState<"post" | "draft">("post")
  const [emojiBelow, setEmojiBelow] = useState(false)
  const [pending, startTransition] = useTransition()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)

  const count = countChars(text)
  const remaining = MAX_POST - count
  const over = remaining < 0
  const pollReady = !poll || pollOptions.filter((o) => o.trim().length > 0).length >= POLL_MIN_OPTIONS
  const hasContent = count > 0 || media.length > 0 || (poll && pollReady)
  const isReply = Boolean(replyToId)
  const scheduledAt = scheduling ? scheduledMs(schedule.date, schedule.time) : null
  const mediaBlocksPoll = poll && media.length > 0
  // A thread is a row of posts sent one after another. Parts after the first are text only, none left empty.
  const threading = extra.length > 0
  const threadReady = extra.every((part) => part.trim().length > 0 && countChars(part) <= MAX_POST)
  const canPost = hasContent && !over && !pending && pollReady && !mediaBlocksPoll && (!scheduling || scheduledAt !== null) && threadReady
  const canDraft = hasContent && !over && !pending && pollReady && !mediaBlocksPoll && !isReply && !threading

  const sending = pending && intent === "post"
  const label = sending
    ? scheduling
      ? "Scheduling"
      : "Posting"
    : isReply
      ? "Reply"
      : quoteOfId
        ? "Quote"
        : scheduling
          ? "Schedule"
          : threading
            ? "Post all"
            : "Post"

  useEffect(() => {
    if (autoFocus || (id && window.location.hash === `#${id}`)) textareaRef.current?.focus()
  }, [autoFocus, id])

  // Suggestions for the word being typed.
  const word = tokenBefore(text, caret)
  const wordKey = word && word.token.length >= 2 ? word.token : ""
  useEffect(() => {
    if (!wordKey) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      fetch(`/api/suggest?q=${encodeURIComponent(wordKey)}`, { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : null))
        .then((data: { users: { id: string; handle: string; name: string; avatarFile: string | null }[]; tags: string[] } | null) => {
          if (!data) return
          const next: Suggestion[] = [
            ...data.users.map((u) => ({ kind: "user" as const, id: u.id, handle: u.handle, name: u.name, avatarFile: u.avatarFile })),
            ...data.tags.map((tag) => ({ kind: "tag" as const, tag })),
          ]
          setSuggestions(next)
          setActive(0)
        })
        .catch(() => undefined)
    }, 120)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [wordKey])

  const open = wordKey !== "" && suggestions.length > 0

  function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return
    const picked = Array.from(list)
    const next: Attachment[] = [...media]
    for (const file of picked) {
      const isVideo = file.type.startsWith("video/")
      const isImage = file.type.startsWith("image/")
      if (!isVideo && !isImage) {
        toast.error("Choose an image or a video.")
        continue
      }
      if (poll) {
        toast.error("Remove the poll to add media.")
        break
      }
      if (isVideo) {
        if (file.size > MAX_VIDEO_BYTES) {
          toast.error("Videos can be up to 25 MB.")
          continue
        }
        if (next.length > 0) {
          toast.error("A post can have one video and nothing else.")
          continue
        }
      } else {
        if (file.size > MAX_IMAGE_BYTES) {
          toast.error("Images can be up to 4 MB.")
          continue
        }
        if (next.some((m) => m.kind === "video")) {
          toast.error("A post can have one video and nothing else.")
          continue
        }
        if (next.length >= MAX_IMAGES) {
          toast.error(`Add up to ${MAX_IMAGES} images.`)
          continue
        }
      }
      next.push({ key: `${Date.now()}-${Math.random().toString(36).slice(2)}`, file, kind: isVideo ? "video" : "image", alt: "", altOpen: false })
    }
    setMedia(next)
  }

  function removeMedia(key: string) {
    setMedia((current) => current.filter((m) => m.key !== key))
  }

  function patchMedia(key: string, patch: Partial<Attachment>) {
    setMedia((current) => current.map((m) => (m.key === key ? { ...m, ...patch } : m)))
  }

  function applySuggestion(item: Suggestion) {
    if (!word) return
    const insert = item.kind === "user" ? `@${item.handle} ` : `#${item.tag} `
    const next = text.slice(0, word.start) + insert + text.slice(caret)
    const position = word.start + insert.length
    setText(next)
    setCaret(position)
    setSuggestions([])
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(position, position)
    })
  }

  // Emoji go in where the caret is, and the caret moves past them.
  function insertEmoji(emoji: string) {
    const next = text.slice(0, caret) + emoji + text.slice(caret)
    const position = caret + emoji.length
    setText(next)
    setCaret(position)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(position, position)
    })
  }

  // The emoji list opens downward when the toolbar sits too near the top of the screen for it to open upward.
  function placeEmojiList() {
    const bar = toolbarRef.current?.getBoundingClientRect()
    if (!bar) return
    setEmojiBelow(bar.top < EMOJI_LIST_HEIGHT && window.innerHeight - bar.bottom > bar.top)
  }

  function toggleScheduling() {
    if (scheduling) {
      setScheduling(false)
      return
    }
    // The days on offer are worked out each time the schedule opens, and a day chosen earlier is kept while it is still on offer.
    setSchedule((current) => {
      const fresh = newSchedule()
      return current.date >= fresh.min && current.date <= fresh.max ? { ...fresh, date: current.date, time: current.time } : fresh
    })
    setScheduling(true)
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Cmd or Ctrl with Enter sends, the way most chat and social apps do.
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !open) {
      event.preventDefault()
      send(false)
      return
    }
    if (!open) return
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setActive((i) => (i + 1) % suggestions.length)
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setActive((i) => (i - 1 + suggestions.length) % suggestions.length)
    } else if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault()
      applySuggestion(suggestions[active])
    } else if (event.key === "Escape") {
      setSuggestions([])
    }
  }

  function onChangeText(event: ChangeEvent<HTMLTextAreaElement>) {
    setText(event.target.value)
    setCaret(event.target.selectionStart ?? event.target.value.length)
  }

  // Alt text goes with its file, in the same order, for photos and videos alike. A reply sends no reply setting, because
  // it takes the setting of the post it answers.
  function buildForm(draft: boolean, at: number | null): FormData {
    const body = new FormData()
    body.set("body", text)
    media.forEach((m) => {
      body.append("media", m.file)
      body.append("alt", m.alt)
    })
    if (poll) {
      body.set("poll", "on")
      body.set("pollMinutes", String(pollMinutes))
      pollOptions.map((o) => o.trim()).filter(Boolean).forEach((o) => body.append("pollOption", o))
    }
    if (replyToId) body.set("replyTo", replyToId)
    if (quoteOfId) body.set("quoteOf", quoteOfId)
    if (!isReply) body.set("replySetting", replySetting)
    if (media.length > 0 && sensitive) body.set("sensitive", "on")
    if (draft) body.set("draft", "on")
    else if (at !== null) body.set("scheduleAt", String(at))
    return body
  }

  function resetComposer() {
    // Clear the composer. The previews let go of their addresses as their tiles go.
    setText("")
    setCaret(0)
    setMedia([])
    setPoll(false)
    setPollOptions(["", ""])
    setSensitive(false)
    setReplySetting("everyone")
    setScheduling(false)
    setExtra([])
  }

  // Adds a part to the thread. Scheduling and drafts are for single posts, so they step aside.
  function addThreadPart() {
    setScheduling(false)
    setExtra((current) => [...current, ""])
  }

  // A thread posts its parts in order. Each part answers the one before it, and all of them sit under the first. If a
  // part is refused, the parts that did not post stay in the composer, so nothing is typed twice.
  function sendThread() {
    setIntent("post")
    const parts = [text, ...extra].map((part) => part.trim())
    const head = buildForm(false, null)
    startTransition(async () => {
      const first = await createPost(head)
      if (!first.ok) {
        toast.error(first.error)
        return
      }
      resetComposer()
      let previous = first.id
      for (let index = 1; index < parts.length; index++) {
        const part = new FormData()
        part.set("body", parts[index])
        part.set("replyTo", previous)
        part.set("threadOf", first.id)
        const next = await createPost(part)
        if (!next.ok) {
          toast.error(`Posted ${index} of ${parts.length} parts. ${next.error}`)
          setText(parts[index])
          setExtra(parts.slice(index + 1))
          return
        }
        previous = next.id
      }
      toast.success("Thread posted.")
      onPosted?.()
    })
  }

  // Post or schedule (draft = false) or save a draft (draft = true).
  function send(draft: boolean) {
    if (draft ? !canDraft : !canPost) return
    if (threading) {
      sendThread()
      return
    }
    const at = draft ? null : scheduledAt
    // A time the server would refuse is reported now, before any file is sent. The server checks it again.
    if (at !== null) {
      const problem = scheduleProblem(at)
      if (problem) {
        toast.error(problem)
        return
      }
    }
    setIntent(draft ? "draft" : "post")
    const body = buildForm(draft, at)

    startTransition(async () => {
      const result = await createPost(body)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      resetComposer()
      if (draft || result.status === "draft") {
        toast.success("Saved to drafts.", { action: { label: "View", onClick: () => router.push("/drafts") } })
      } else if (result.status === "scheduled" && at !== null) {
        toast.success("Scheduled.", { description: `Goes out ${fullTimestamp(at)}` })
      } else if (result.status === "published") {
        const message = replyToId ? "Reply posted." : quoteOfId ? "Quote posted." : "Posted."
        // The post can be taken back for a few seconds, the same window the server enforces.
        const postId = result.id
        toast.success(message, {
          duration: UNDO_WINDOW_MS,
          action: {
            label: "Undo",
            onClick: () => {
              undoPost(postId).then((undone) => {
                if (undone.ok) toast.success("Post deleted.")
                else toast.error(undone.error)
              })
            },
          },
        })
      }
      onPosted?.()
    })
  }

  // The count and, on a new post, the reply picker sit in the corner, beside the first line of text.
  const showCount = count > 0
  const showCorner = showCount || !isReply

  return (
    <form
      id={id}
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        send(false)
      }}
      aria-busy={pending}
      className={cn("flex gap-3", compact ? "" : "border-b border-border px-5 pt-3 pb-3")}
    >
      <Avatar user={viewer} size={44} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start gap-2">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={onChangeText}
            onSelect={(event) => setCaret(event.currentTarget.selectionStart ?? 0)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            aria-label="Post text"
            aria-autocomplete="list"
            readOnly={pending}
            rows={1}
            className="field-sizing-content min-h-[30px] min-w-0 flex-1 resize-none bg-transparent pt-0.5 text-[17px] leading-relaxed outline-none placeholder:text-muted-foreground max-sm:min-h-10 max-sm:pt-1.5"
          />
          {showCorner ? (
            <div className="flex h-8 shrink-0 items-center gap-2">
              {showCount ? (
                <span className="flex items-center gap-1.5">
                  {remaining <= 20 ? (
                    <>
                      <span aria-hidden="true" className={cn("text-sm tabular-nums", over ? "text-destructive" : "text-muted-foreground")}>
                        {remaining}
                      </span>
                      <span role="status" className="sr-only">
                        {over ? `${-remaining} ${pluralize(-remaining, "character")} over the limit` : `${remaining} ${pluralize(remaining, "character")} left`}
                      </span>
                    </>
                  ) : null}
                  <CountRing progress={Math.min(count / MAX_POST, 1)} over={over} />
                </span>
              ) : null}
              {!isReply ? (
                <div className={REPLY_PICKER_PHONE}>
                  <ReplyPicker value={replySetting} onChange={setReplySetting} />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        {open ? (
          <ul role="listbox" aria-label="Suggestions" className="glass z-30 w-full max-w-sm overflow-hidden rounded-[22px] py-1">
            {suggestions.map((item, index) => (
              <li key={item.kind === "user" ? item.id : item.tag} role="option" aria-selected={index === active}>
                <button
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault()
                    applySuggestion(item)
                  }}
                  onMouseEnter={() => setActive(index)}
                  className={cn("flex w-full items-center gap-3 px-3 py-2 text-left transition-colors duration-150", index === active && "bg-foreground/5")}
                >
                  {item.kind === "user" ? (
                    <>
                      <Avatar user={{ id: item.id, name: item.name, avatarFile: item.avatarFile }} size={28} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{item.name}</span>
                        <span className="block truncate text-[13px] text-muted-foreground">@{item.handle}</span>
                      </span>
                    </>
                  ) : (
                    <span className="text-sm font-semibold">#{item.tag}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {media.length > 0 ? (
          <div className={cn("grid gap-2", media.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
            {media.map((item) => (
              <MediaTile key={item.key} item={item} onRemove={() => removeMedia(item.key)} onPatch={(patch) => patchMedia(item.key, patch)} />
            ))}
          </div>
        ) : null}

        {poll ? (
          <fieldset className="glass flex flex-col gap-2 rounded-[22px] p-3">
            <legend className="px-1 text-[13px] text-muted-foreground">Poll</legend>
            {pollOptions.map((option, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  value={option}
                  maxLength={MAX_POLL_OPTION}
                  onChange={(event) => setPollOptions((current) => current.map((o, i) => (i === index ? event.target.value : o)))}
                  placeholder={`Choice ${index + 1}`}
                  aria-label={`Choice ${index + 1}`}
                  className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-[15px] outline-none transition-colors focus:border-foreground"
                />
                {pollOptions.length > POLL_MIN_OPTIONS ? (
                  <button
                    type="button"
                    aria-label={`Remove choice ${index + 1}`}
                    onClick={() => setPollOptions((current) => current.filter((_, i) => i !== index))}
                    className="grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors duration-200 hover:bg-foreground/5 hover:text-foreground sm:size-9"
                  >
                    <Trash2 className="size-4" />
                  </button>
                ) : null}
              </div>
            ))}
            <div className="flex flex-wrap items-center justify-between gap-2">
              {pollOptions.length < POLL_MAX_OPTIONS ? (
                <button
                  type="button"
                  onClick={() => setPollOptions((current) => [...current, ""])}
                  className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-sm font-semibold transition-colors duration-200 hover:bg-foreground/5 max-sm:min-h-10 max-sm:px-3"
                >
                  <Plus className="size-4" /> Add choice
                </button>
              ) : (
                <span />
              )}
              <label className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Length</span>
                <select value={pollMinutes} onChange={(event) => setPollMinutes(Number(event.target.value))} className={cn(FIELD, "text-sm")}>
                  {POLL_DURATIONS.map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {DURATION_LABELS[minutes]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </fieldset>
        ) : null}

        {/* Whether the media needs a warning. */}
        {media.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-pressed={sensitive}
              onClick={() => setSensitive((value) => !value)}
              className={cn(PILL, sensitive ? "metal" : "glass text-foreground hover:bg-foreground/5")}
            >
              Mark media as sensitive
            </button>
          </div>
        ) : null}

        {scheduling ? (
          <div className="glass flex flex-wrap items-center gap-2 rounded-[22px] p-3 text-sm">
            <CalendarClock className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <label className="flex items-center">
              <span className="sr-only">Date</span>
              <input
                type="date"
                value={schedule.date}
                min={schedule.min}
                max={schedule.max}
                onChange={(event) => setSchedule((current) => ({ ...current, date: event.target.value }))}
                className={FIELD}
              />
            </label>
            <label className="flex items-center">
              <span className="sr-only">Time</span>
              <select value={schedule.time} onChange={(event) => setSchedule((current) => ({ ...current, time: event.target.value }))} className={FIELD}>
                {TIME_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <span className="min-w-0 text-muted-foreground">{scheduledAt !== null ? `Goes out ${fullTimestamp(scheduledAt)}` : "Pick a date and time"}</span>
            <button
              type="button"
              onClick={() => setScheduling(false)}
              className="ml-auto rounded-full px-3 py-1.5 font-semibold transition-colors duration-200 hover:bg-foreground/5 max-sm:min-h-10"
            >
              Post now instead
            </button>
          </div>
        ) : null}

        {threading ? (
          <div className="flex flex-col gap-3 border-l-2 border-border pl-4">
            {extra.map((part, index) => {
              const remaining = MAX_POST - countChars(part)
              return (
                <div key={index} className="flex items-start gap-2">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <textarea
                      value={part}
                      onChange={(event) => setExtra((current) => current.map((p, i) => (i === index ? event.target.value : p)))}
                      placeholder="Continue the thread"
                      aria-label={`Thread part ${index + 2} of ${extra.length + 1}`}
                      readOnly={pending}
                      rows={2}
                      className="field-sizing-content min-h-[30px] w-full resize-none bg-transparent pt-0.5 text-[17px] leading-relaxed outline-none placeholder:text-muted-foreground"
                    />
                    <span className={cn("self-end text-xs tabular-nums", remaining < 0 ? "text-destructive" : "text-muted-foreground")}>
                      {index + 2} of {extra.length + 1}
                      {remaining <= 20 ? ` · ${remaining}` : ""}
                    </span>
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove part ${index + 2}`}
                    onClick={() => setExtra((current) => current.filter((_, i) => i !== index))}
                    className="grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors duration-200 hover:bg-foreground/5 hover:text-foreground sm:size-9"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              )
            })}
          </div>
        ) : null}

        <div ref={toolbarRef} className="relative flex flex-wrap items-center gap-x-0.5 gap-y-1 pt-1">
          <ToolButton label="Add photos or video" hint="Remove the poll to add photos or video" disabled={poll} onClick={() => fileRef.current?.click()}>
            <ImageIcon className="size-[20px]" strokeWidth={1.8} aria-hidden="true" />
          </ToolButton>
          <ToolButton
            label={poll ? "Remove poll" : "Add a poll"}
            hint="Remove the photos or video to add a poll"
            disabled={media.length > 0}
            pressed={poll}
            onClick={() => setPoll((value) => !value)}
          >
            <ListChecks className="size-[20px]" strokeWidth={1.8} aria-hidden="true" />
          </ToolButton>
          {!isReply ? (
            <ToolButton label="Add to thread" hint="Turn off scheduling to start a thread" disabled={scheduling} onClick={addThreadPart}>
              <Plus className="size-[20px]" strokeWidth={1.8} aria-hidden="true" />
            </ToolButton>
          ) : null}
          <span className="contents" onClickCapture={placeEmojiList}>
            <EmojiPicker onPick={insertEmoji} className={cn(EMOJI_PHONE, emojiBelow && EMOJI_BELOW)} />
          </span>
          {!isReply && !threading ? (
            <ToolButton label="Schedule this post" pressed={scheduling} onClick={toggleScheduling}>
              <CalendarClock className="size-[20px]" strokeWidth={1.8} aria-hidden="true" />
            </ToolButton>
          ) : null}
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
            multiple
            className="hidden"
            onChange={(event) => {
              addFiles(event.target.files)
              event.target.value = ""
            }}
          />

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            {poll ? <span className="sr-only">{pollReady ? "Poll ready" : "Add at least two poll choices"}</span> : null}
            {!isReply && !threading ? (
              <button
                type="button"
                onClick={() => send(true)}
                disabled={!canDraft}
                aria-label="Save draft"
                title="Save draft"
                className="chrome-ring grid size-10 place-items-center rounded-full text-foreground transition-opacity duration-200 hover:opacity-75 disabled:opacity-35 sm:h-9 sm:w-auto sm:px-4 sm:text-[15px] sm:font-semibold"
              >
                <Save className="size-[17px] sm:hidden" strokeWidth={2} aria-hidden="true" />
                <span className="hidden sm:inline">{pending && intent === "draft" ? "Saving" : "Save draft"}</span>
              </button>
            ) : null}
            <button
              type="submit"
              disabled={!canPost}
              className="metal h-10 rounded-full px-4 text-[15px] font-semibold whitespace-nowrap transition-opacity duration-200 hover:opacity-85 disabled:opacity-35 sm:h-9 sm:px-5"
            >
              {label}
            </button>
          </div>
        </div>
      </div>
    </form>
  )
}
