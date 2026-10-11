"use client"

import { useEffect, useRef, useState, useTransition, type ChangeEvent, type FormEvent, type KeyboardEvent } from "react"
import { motion } from "motion/react"
import { CalendarClock, ImageIcon, ListChecks, Plus, Trash2, X } from "lucide-react"
import { toast } from "sonner"
import { createPost } from "@/actions/posts"
import { Avatar, type AvatarUser } from "@/components/app/avatar"
import { EmojiPicker } from "@/components/app/emoji-picker"
import { Button } from "@/components/ui/button"
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
  REPLY_SETTING_LABELS,
  REPLY_SETTINGS,
  SCHEDULE_MAX_AHEAD_MS,
  SCHEDULE_MIN_LEAD_MS,
  countChars,
  type ReplySetting,
} from "@/lib/rules"
import { cn } from "@/lib/utils"

type ComposerProps = {
  viewer: AvatarUser
  replyToId?: string
  quoteOfId?: string
  communityId?: string
  communityName?: string
  placeholder: string
  id?: string
  compact?: boolean
  autoFocus?: boolean
  onPosted?: () => void
}

type Draft = {
  key: string
  file: File
  url: string
  kind: "image" | "video"
  alt: string
  altOpen: boolean
}

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

const POLL_DEFAULT_MINUTES = 1440

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
        className={over ? "stroke-destructive" : "stroke-dusk"}
        animate={{ strokeDashoffset: circumference * (1 - progress) }}
        initial={false}
        transition={{ duration: 0.25, ease: "easeOut" }}
      />
    </svg>
  )
}

// The @ or # word being typed just before the caret, if any.
function tokenBefore(text: string, caret: number): { token: string; start: number } | null {
  const match = /(^|\s)([@#][\p{L}\p{N}_]*)$/u.exec(text.slice(0, caret))
  if (!match) return null
  return { token: match[2], start: caret - match[2].length }
}

function toLocalInput(ms: number): string {
  const date = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function Composer({
  viewer,
  replyToId,
  quoteOfId,
  communityId,
  communityName,
  placeholder,
  id,
  compact = false,
  autoFocus = false,
  onPosted,
}: ComposerProps) {
  const [text, setText] = useState("")
  const [caret, setCaret] = useState(0)
  const [media, setMedia] = useState<Draft[]>([])
  const [poll, setPoll] = useState(false)
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""])
  const [pollMinutes, setPollMinutes] = useState<number>(POLL_DEFAULT_MINUTES)
  const [sensitive, setSensitive] = useState(false)
  const [replySetting, setReplySetting] = useState<ReplySetting>("everyone")
  const [scheduling, setScheduling] = useState(false)
  const [scheduleValue, setScheduleValue] = useState("")
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [active, setActive] = useState(0)
  const [pending, startTransition] = useTransition()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const urlsRef = useRef<Set<string>>(new Set())

  const count = countChars(text)
  const remaining = MAX_POST - count
  const over = remaining < 0
  // The clock is read when the composer renders, which is when the schedule is checked.
  // eslint-disable-next-line react-hooks/purity
  const clock = Date.now()
  const scheduleAt = scheduling && scheduleValue ? new Date(scheduleValue).getTime() : null
  const scheduleError =
    scheduleAt === null
      ? null
      : !Number.isFinite(scheduleAt)
        ? "Pick a valid time."
        : scheduleAt < clock + SCHEDULE_MIN_LEAD_MS
          ? "Schedule at least 5 minutes ahead."
          : scheduleAt > clock + SCHEDULE_MAX_AHEAD_MS
            ? "Schedule up to 75 days ahead."
            : null
  const pollReady = !poll || pollOptions.filter((o) => o.trim().length > 0).length >= POLL_MIN_OPTIONS
  const hasContent = count > 0 || media.length > 0 || (poll && pollReady)
  const canPost = hasContent && !over && !pending && pollReady && !scheduleError && !(poll && media.length > 0)
  const isReply = Boolean(replyToId)
  const showDraft = !isReply && !quoteOfId

  const label = pending
    ? "Posting"
    : isReply
      ? "Reply"
      : quoteOfId
        ? "Quote"
        : scheduleAt !== null && !scheduleError
          ? "Schedule"
          : "Post"

  useEffect(() => {
    if (autoFocus || (id && window.location.hash === `#${id}`)) textareaRef.current?.focus()
  }, [autoFocus, id])

  useEffect(() => {
    const urls = urlsRef.current
    return () => {
      for (const url of urls) URL.revokeObjectURL(url)
      urls.clear()
    }
  }, [])

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
    const next: Draft[] = [...media]
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
      const url = URL.createObjectURL(file)
      urlsRef.current.add(url)
      next.push({ key: `${Date.now()}-${Math.random().toString(36).slice(2)}`, file, url, kind: isVideo ? "video" : "image", alt: "", altOpen: false })
    }
    setMedia(next)
  }

  function removeMedia(key: string) {
    setMedia((current) => {
      const target = current.find((m) => m.key === key)
      if (target) {
        URL.revokeObjectURL(target.url)
        urlsRef.current.delete(target.url)
      }
      return current.filter((m) => m.key !== key)
    })
  }

  function patchMedia(key: string, patch: Partial<Draft>) {
    setMedia((current) => current.map((m) => (m.key === key ? { ...m, ...patch } : m)))
  }

  function insertAt(insert: string) {
    const element = textareaRef.current
    const start = element?.selectionStart ?? text.length
    const end = element?.selectionEnd ?? text.length
    const next = text.slice(0, start) + insert + text.slice(end)
    setText(next)
    const position = start + insert.length
    setCaret(position)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(position, position)
    })
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

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
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

  function submit(event?: FormEvent<HTMLFormElement>, asDraft = false) {
    event?.preventDefault()
    if (!canPost && !(asDraft && hasContent && !over)) return
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
    if (sensitive && media.length > 0) body.set("sensitive", "on")
    if (asDraft && showDraft) body.set("draft", "on")
    if (!asDraft && scheduleAt !== null && !scheduleError) body.set("scheduleAt", String(scheduleAt))
    if (replyToId) body.set("replyTo", replyToId)
    if (quoteOfId) body.set("quoteOf", quoteOfId)
    if (communityId && !replyToId) body.set("communityId", communityId)
    if (!replyToId) body.set("replySetting", replySetting)

    startTransition(async () => {
      const result = await createPost(body)
      if (result.ok) {
        setText("")
        setCaret(0)
        setMedia((current) => {
          for (const m of current) {
            URL.revokeObjectURL(m.url)
            urlsRef.current.delete(m.url)
          }
          return []
        })
        setPoll(false)
        setPollOptions(["", ""])
        setSensitive(false)
        setScheduling(false)
        setScheduleValue("")
        const message =
          result.status === "draft"
            ? "Saved to drafts."
            : result.status === "scheduled"
              ? "Scheduled."
              : replyToId
                ? "Reply posted."
                : quoteOfId
                  ? "Quote posted."
                  : "Posted."
        toast.success(message)
        onPosted?.()
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <form id={id} onSubmit={(event) => submit(event)} className={cn("flex gap-3", compact ? "" : "border-b border-border px-4 py-3")}>
      <Avatar user={viewer} size={40} className="mt-0.5" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {communityName ? (
          <p className="text-[13px] text-dusk">Posting in {communityName}</p>
        ) : null}
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={onChangeText}
            onSelect={(event) => setCaret(event.currentTarget.selectionStart ?? 0)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            aria-label="Post text"
            aria-autocomplete="list"
            rows={2}
            className="field-sizing-content min-h-12 w-full resize-none bg-transparent text-base leading-relaxed outline-none placeholder:text-muted-foreground"
          />
          {open ? (
            <ul role="listbox" aria-label="Suggestions" className="absolute top-full left-0 z-30 mt-1 w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-popover py-1 shadow-lg">
              {suggestions.map((item, index) => (
                <li key={item.kind === "user" ? item.id : item.tag} role="option" aria-selected={index === active}>
                  <button
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault()
                      applySuggestion(item)
                    }}
                    onMouseEnter={() => setActive(index)}
                    className={cn("flex w-full items-center gap-3 px-3 py-2 text-left", index === active && "bg-muted")}
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
                      <span className="text-sm font-semibold text-dusk">#{item.tag}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {media.length > 0 ? (
          <div className={cn("grid gap-2", media.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
            {media.map((item) => (
              <div key={item.key} className="flex flex-col gap-1.5">
                <div className="relative overflow-hidden rounded-xl border border-border bg-muted">
                  {item.kind === "video" ? (
                    <video src={item.url} muted playsInline controls className="max-h-72 w-full" aria-label="Selected video" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.url} alt={item.alt || "Selected image"} className="max-h-72 w-full object-cover" />
                  )}
                  <button
                    type="button"
                    onClick={() => removeMedia(item.key)}
                    aria-label="Remove media"
                    className="absolute top-2 right-2 grid size-7 place-items-center rounded-full bg-background/90 text-foreground ring-1 ring-border hover:bg-muted"
                  >
                    <X className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => patchMedia(item.key, { altOpen: !item.altOpen })}
                    aria-expanded={item.altOpen}
                    className={cn(
                      "absolute bottom-2 left-2 rounded-md px-2 py-0.5 text-[12px] font-semibold",
                      item.alt ? "bg-dusk text-background" : "bg-background/90 text-foreground ring-1 ring-border"
                    )}
                  >
                    ALT
                  </button>
                </div>
                {item.altOpen ? (
                  <label className="flex flex-col gap-1 text-[13px]">
                    <span className="text-muted-foreground">Describe this for people who can&apos;t see it</span>
                    <textarea
                      value={item.alt}
                      maxLength={MAX_ALT}
                      rows={2}
                      onChange={(event) => patchMedia(item.key, { alt: event.target.value })}
                      className="resize-none rounded-lg border border-border bg-background p-2 text-sm outline-none focus:border-dusk"
                    />
                  </label>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {poll ? (
          <fieldset className="flex flex-col gap-2 rounded-2xl border border-border p-3">
            <legend className="px-1 text-[13px] text-muted-foreground">Poll</legend>
            {pollOptions.map((option, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  value={option}
                  maxLength={MAX_POLL_OPTION}
                  onChange={(event) => setPollOptions((current) => current.map((o, i) => (i === index ? event.target.value : o)))}
                  placeholder={`Choice ${index + 1}`}
                  aria-label={`Choice ${index + 1}`}
                  className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-[15px] outline-none focus:border-dusk"
                />
                {pollOptions.length > POLL_MIN_OPTIONS ? (
                  <button
                    type="button"
                    aria-label={`Remove choice ${index + 1}`}
                    onClick={() => setPollOptions((current) => current.filter((_, i) => i !== index))}
                    className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
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
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-dusk hover:underline"
                >
                  <Plus className="size-4" /> Add choice
                </button>
              ) : (
                <span />
              )}
              <label className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Length</span>
                <select
                  value={pollMinutes}
                  onChange={(event) => setPollMinutes(Number(event.target.value))}
                  className="h-9 rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-dusk"
                >
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

        {scheduling ? (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Post on</span>
            <input
              type="datetime-local"
              value={scheduleValue}
              min={toLocalInput(clock + SCHEDULE_MIN_LEAD_MS)}
              onChange={(event) => setScheduleValue(event.target.value)}
              className="h-10 w-fit rounded-lg border border-border bg-background px-3 outline-none focus:border-dusk"
            />
            {scheduleError ? <span className="text-destructive">{scheduleError}</span> : null}
          </label>
        ) : null}

        {!isReply && !compact ? (
          <label className="flex w-fit items-center gap-2 text-[13px] text-muted-foreground">
            <span>Who can reply</span>
            <select
              value={replySetting}
              onChange={(event) => setReplySetting(event.target.value as ReplySetting)}
              className="h-8 rounded-lg border border-border bg-background px-2 text-[13px] text-foreground outline-none focus:border-dusk"
            >
              {REPLY_SETTINGS.map((option) => (
                <option key={option} value={option}>
                  {REPLY_SETTING_LABELS[option]}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <div className="flex flex-wrap items-center gap-1 border-t border-border pt-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label="Add photos or video"
            disabled={poll}
            className="grid size-9 place-items-center rounded-lg text-dusk transition-colors hover:bg-muted disabled:opacity-40"
          >
            <ImageIcon className="size-5" />
          </button>
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
          <button
            type="button"
            onClick={() => setPoll((value) => !value)}
            aria-label={poll ? "Remove poll" : "Add a poll"}
            aria-pressed={poll}
            disabled={media.length > 0}
            className={cn("grid size-9 place-items-center rounded-lg text-dusk transition-colors hover:bg-muted disabled:opacity-40", poll && "bg-dusk/10")}
          >
            <ListChecks className="size-5" />
          </button>
          {media.length > 0 ? (
            <button
              type="button"
              onClick={() => setSensitive((value) => !value)}
              aria-pressed={sensitive}
              className={cn("h-9 rounded-lg px-2 text-[13px] font-semibold text-dusk transition-colors hover:bg-muted", sensitive && "bg-dusk/10")}
            >
              {sensitive ? "Marked sensitive" : "Mark sensitive"}
            </button>
          ) : null}
          {!isReply ? (
            <button
              type="button"
              onClick={() => {
                setScheduling((value) => !value)
                if (!scheduling && !scheduleValue) setScheduleValue(toLocalInput(Date.now() + 60 * 60 * 1000))
              }}
              aria-label={scheduling ? "Remove schedule" : "Schedule post"}
              aria-pressed={scheduling}
              className={cn("grid size-9 place-items-center rounded-lg text-dusk transition-colors hover:bg-muted", scheduling && "bg-dusk/10")}
            >
              <CalendarClock className="size-5" />
            </button>
          ) : null}
          <EmojiPicker onPick={insertAt} />

          <div className="ml-auto flex items-center gap-3">
            {count > 0 ? <CountRing progress={Math.min(count / MAX_POST, 1)} over={over} /> : null}
            {count > 0 && remaining <= 20 ? (
              <span className={cn("text-sm tabular-nums", over ? "text-destructive" : "text-muted-foreground")}>{remaining}</span>
            ) : null}
            {poll ? (
              <span className="sr-only">{pollReady ? "Poll ready" : "Add at least two poll choices"}</span>
            ) : null}
            {showDraft ? (
              <Button
                type="button"
                variant="outline"
                disabled={!hasContent || over || pending}
                onClick={() => submit(undefined, true)}
                className="h-9 rounded-full px-4 font-semibold"
              >
                Save draft
              </Button>
            ) : null}
            <Button type="submit" disabled={!canPost} className="h-9 rounded-full px-5 font-semibold">
              {label}
            </Button>
          </div>
        </div>
      </div>
    </form>
  )
}
