"use client"

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, useTransition, type ChangeEvent, type FormEvent, type KeyboardEvent, type ReactNode } from "react"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { CalendarClock, CircleDot, FileText, ImageIcon, ListChecks, LoaderCircle, Plus, Save, Sticker as StickerIcon, Trash2, X } from "lucide-react"
import { toast } from "sonner"
import { createPost, undoPost, type CreateResult } from "@/actions/posts"
import { Avatar, type AvatarUser } from "@/components/app/avatar"
import { EmojiPicker } from "@/components/app/emoji-picker"
import type { Ratio } from "@/components/app/photo-crop"
import { useProofGate } from "@/components/app/proof-dialog"
import { StickerEditLayer, StickerLayer, type StickerPatch } from "@/components/app/sticker-layer"
import type { StickerPick } from "@/components/app/sticker-tray"
import { MAX_STICKERS, TEXT_BACKGROUNDS, TEXT_COLORS, TEXT_FONTS, TEXT_LOOK_FIELDS, clamp, type Sticker } from "@/lib/stickers"
import { ReplyPicker } from "@/components/app/reply-picker"
import { fullTimestamp, pluralize } from "@/lib/format"
import {
  MAX_ALT,
  MAX_IMAGE_BYTES,
  MAX_IMAGES,
  MAX_POLL_OPTION,
  MAX_ARTICLE,
  MAX_POST,
  MAX_TITLE,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_SECONDS,
  POLL_DURATIONS,
  POLL_MAX_OPTIONS,
  POLL_MIN_OPTIONS,
  SCHEDULE_MAX_AHEAD_MS,
  UNDO_WINDOW_MS,
  cleanTitle,
  countChars,
  validateSchedule,
  type ReplySetting,
} from "@/lib/rules"
import { cn } from "@/lib/utils"

// The composer: text, optional media or a poll, who can reply, and when it goes out.
// Post sends now, Schedule waits for a time, and Save draft keeps it for later.
// A reply takes its reply setting from the post it answers, so a reply has no "Who can reply" choice, no schedule and no draft.

type CircleOption = { id: string; name: string }

type ComposerProps = {
  viewer: AvatarUser
  replyToId?: string
  quoteOfId?: string
  // A circle page passes its own circle, so the post goes there. The home composer passes the circles the viewer is in,
  // and the author picks one or none.
  circle?: CircleOption
  circles?: CircleOption[]
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
  // The photo's width over its height, once it has loaded, and the stickers on it. A video never carries stickers.
  aspect: number | null
  stickers: Sticker[]
  stickerOpen: boolean
  selected: number | null
  // The selected text sticker is being edited in place.
  editing: boolean
}

function makeAttachment(file: File, kind: "image" | "video"): Attachment {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    file,
    kind,
    alt: "",
    altOpen: false,
    aspect: null,
    stickers: [],
    stickerOpen: false,
    selected: null,
    editing: false,
  }
}

// The shapes a picture can be framed in. Original keeps the picture's own shape.
const FRAME_RATIOS: Ratio[] = [
  { label: "Original", value: null },
  { label: "Square", value: 1 },
  { label: "4:5", value: 4 / 5 },
  { label: "16:9", value: 16 / 9 },
]

// The choices for a selected text sticker, in the order the panel shows them.
const FONT_OPTIONS: { value: (typeof TEXT_FONTS)[number]; name: string }[] = [
  { value: "sans", name: "Sans" },
  { value: "serif", name: "Serif" },
  { value: "mono", name: "Mono" },
]
const COLOR_OPTIONS: { value: (typeof TEXT_COLORS)[number]; name: string }[] = [
  { value: "white", name: "White" },
  { value: "black", name: "Black" },
  { value: "yellow", name: "Yellow" },
]
const BACKGROUND_OPTIONS: { value: (typeof TEXT_BACKGROUNDS)[number]; name: string }[] = [
  { value: "solid", name: "Solid" },
  { value: "outline", name: "Outline" },
  { value: "none", name: "None" },
]

const StickerTray = dynamic(() => import("@/components/app/sticker-tray").then((module) => module.StickerTray), { ssr: false, loading: () => null })
// The photo framing dialog opens only after a photo is picked, so its code waits for that.
const PhotoCrop = dynamic(() => import("@/components/app/photo-crop").then((module) => module.PhotoCrop), { ssr: false, loading: () => null })

type MediaPatch = Partial<Attachment> | ((current: Attachment) => Partial<Attachment>)

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
  "tap-44 inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-8"
const FIELD = "h-10 rounded-full border border-border bg-background px-3 outline-none transition-colors focus:border-foreground sm:h-9"
// The emoji list is a component of its own, so its phone sizes are set from here: 40px buttons, and an emoji list that
// opens from the toolbar's left edge so it stays on the screen.
const EMOJI_PHONE =
  "max-sm:static max-sm:[&>button]:size-9 max-[429px]:[&>button]:size-8 max-sm:[&_[role=dialog]]:w-[278px] max-sm:[&_[role=dialog]_button]:size-10 sm:[&>button]:size-8"
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
        "tap-44 grid size-9 shrink-0 place-items-center rounded-full text-foreground transition-colors duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent max-[429px]:size-8 sm:size-8",
        pressed && "bg-foreground/5"
      )}
    >
      {children}
    </button>
  )
}

const PANEL_BUTTON =
  "h-9 rounded-full border border-border px-3 font-semibold transition-colors duration-200 hover:bg-foreground/5 disabled:opacity-50"

// A row of pills where one is chosen. The chosen one is filled, and says so to assistive technology.
function ChoiceGroup<T extends string>({
  label,
  options,
  value,
  onChoose,
}: {
  label: string
  options: { value: T; name: string }[]
  value: T
  onChoose: (value: T) => void
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1.5">
      <span aria-hidden className="mr-0.5 text-muted-foreground">
        {label}
      </span>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChoose(option.value)}
          className={cn(
            "h-9 rounded-full px-3 font-semibold transition-colors duration-200",
            value === option.value ? "bg-foreground text-background" : "border border-border hover:bg-foreground/5"
          )}
        >
          {option.name}
        </button>
      ))}
    </div>
  )
}

// One picture or video with its remove control, its ALT control and, for a picture, its stickers. Photos and videos take
// the same description, and both say what they show to people who can't see them. On a video the ALT control sits at the
// top, clear of the player's controls. A picture's stickers are added and changed from the tile; the controls for a
// selected sticker sit under the picture.
function MediaTile({
  item,
  onRemove,
  onPatch,
  onOpenTray,
}: {
  item: Attachment
  onRemove: () => void
  onPatch: (patch: MediaPatch) => void
  onOpenTray: () => void
}) {
  const url = usePreview(item.file)
  const altId = useId()
  const video = item.kind === "video"
  const full = item.stickers.length >= MAX_STICKERS
  const set = !video && item.aspect !== null && item.stickers.length > 0 ? { aspect: item.aspect, items: item.stickers } : null
  const selectedIndex = item.selected
  const selected = selectedIndex !== null ? (item.stickers[selectedIndex] ?? null) : null

  function changeSticker(index: number, patch: StickerPatch) {
    onPatch((current) => ({ stickers: current.stickers.map((s, i) => (i === index ? ({ ...s, ...patch } as Sticker) : s)) }))
  }

  function removeSticker(index: number) {
    onPatch((current) => ({ stickers: current.stickers.filter((_, i) => i !== index), selected: null, editing: false }))
  }

  // The selected sticker moves to the top of the stack, which is the last one in the list.
  function bringToFront() {
    onPatch((current) => {
      if (current.selected === null) return {}
      const sticker = current.stickers[current.selected]
      if (!sticker) return {}
      const rest = current.stickers.filter((_, i) => i !== current.selected)
      return { stickers: [...rest, sticker], selected: rest.length, editing: false }
    })
  }

  // A copy of the selected sticker goes on top, a little down and to the right of the first.
  function duplicateSticker() {
    onPatch((current) => {
      if (current.selected === null || current.stickers.length >= MAX_STICKERS) return {}
      const sticker = current.stickers[current.selected]
      if (!sticker) return {}
      const copy = { ...sticker, x: clamp(sticker.x + 0.03, 0, 1), y: clamp(sticker.y + 0.03, 0, 1) } as Sticker
      return { stickers: [...current.stickers, copy], selected: current.stickers.length, editing: false }
    })
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative overflow-hidden rounded-2xl bg-muted">
        {url === null ? (
          <div className="aspect-video w-full" aria-hidden="true" />
        ) : video ? (
          <video src={url} muted playsInline controls preload="metadata" className="max-h-72 w-full" aria-label={item.alt || "Selected video"} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={item.alt || "Selected image"}
            onLoad={(event) => {
              const img = event.currentTarget
              if (item.aspect === null && img.naturalHeight > 0) onPatch({ aspect: img.naturalWidth / img.naturalHeight })
            }}
            className="max-h-72 w-full object-cover"
          />
        )}
        {set && item.stickerOpen ? (
          <StickerEditLayer
            set={set}
            selected={selectedIndex}
            editing={item.editing}
            onSelect={(index) => onPatch({ selected: index, editing: false })}
            onEdit={(editing) => onPatch({ editing })}
            onChange={changeSticker}
            onRemove={removeSticker}
          />
        ) : set ? (
          <StickerLayer set={set} />
        ) : null}
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove media"
          className="tap-44 absolute top-2 right-2 grid size-10 place-items-center rounded-full bg-background/85 text-foreground transition-colors duration-200 hover:bg-transparent sm:size-8"
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
        {video ? null : (
          <button
            type="button"
            onClick={() => onPatch((current) => ({ stickerOpen: !current.stickerOpen, selected: null, editing: false }))}
            disabled={item.aspect === null}
            aria-expanded={item.stickerOpen}
            title={item.stickerOpen ? "Finish with stickers" : "Add stickers to this photo"}
            className={cn(
              "absolute right-2 bottom-2 inline-flex items-center gap-1.5 rounded-full px-2.5 text-[12px] font-semibold transition-colors duration-200 disabled:opacity-50 max-sm:h-10 max-sm:min-w-10 max-sm:text-[13px] sm:h-6",
              item.stickerOpen ? "metal" : "glass text-foreground"
            )}
          >
            <StickerIcon className="size-4" aria-hidden />
            {item.stickerOpen ? "Done" : "Stickers"}
          </button>
        )}
      </div>
      {!video && item.stickerOpen && item.aspect !== null ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-background p-2.5 text-[13px]">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={onOpenTray} disabled={full} className={PANEL_BUTTON}>
              {full ? `Up to ${MAX_STICKERS} stickers` : "Add a sticker"}
            </button>
            {selected && selectedIndex !== null ? (
              <>
                <button
                  type="button"
                  onClick={bringToFront}
                  disabled={selectedIndex === item.stickers.length - 1}
                  className={PANEL_BUTTON}
                >
                  Bring to front
                </button>
                <button type="button" onClick={duplicateSticker} disabled={full} className={PANEL_BUTTON}>
                  Duplicate
                </button>
                {selected.kind === "text" ? (
                  <button type="button" onClick={() => onPatch({ editing: true })} className={PANEL_BUTTON}>
                    Edit text
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => removeSticker(selectedIndex)}
                  className="h-9 rounded-full px-3 font-semibold text-destructive transition-colors duration-200 hover:bg-destructive/10"
                >
                  Delete sticker
                </button>
              </>
            ) : null}
          </div>
          {selected && selectedIndex !== null ? (
            <>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <label className="flex items-center gap-2">
                  <span className="text-muted-foreground">Size</span>
                  <input
                    type="range"
                    min={5}
                    max={60}
                    aria-label="Sticker size"
                    value={Math.round(selected.size * 100)}
                    onChange={(event) => changeSticker(selectedIndex, { size: Number(event.target.value) / 100 })}
                    className="accent-dusk"
                  />
                </label>
                <label className="flex items-center gap-2">
                  <span className="text-muted-foreground">Turn</span>
                  <input
                    type="range"
                    min={-180}
                    max={180}
                    aria-label="Sticker turn"
                    value={Math.round(selected.rotate)}
                    onChange={(event) => changeSticker(selectedIndex, { rotate: Number(event.target.value) })}
                    className="accent-dusk"
                  />
                </label>
              </div>
              {selected.kind === "text" ? (
                <div className="flex flex-col gap-2.5">
                  <ChoiceGroup
                    label="Font"
                    options={FONT_OPTIONS}
                    value={selected.font}
                    onChoose={(font) => changeSticker(selectedIndex, { font })}
                  />
                  <ChoiceGroup
                    label="Colour"
                    options={COLOR_OPTIONS}
                    value={selected.color}
                    onChoose={(color) => changeSticker(selectedIndex, { color })}
                  />
                  <ChoiceGroup
                    label="Background"
                    options={BACKGROUND_OPTIONS}
                    value={selected.background}
                    onChoose={(background) => changeSticker(selectedIndex, { background })}
                  />
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-muted-foreground">Tap a sticker to select it. Drag one to move it, or drop it on the bin to remove it.</p>
          )}
        </div>
      ) : null}
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
const VIDEO_MB = Math.round(MAX_VIDEO_BYTES / (1024 * 1024))

// The length of a picked video, read from its metadata. Null when the browser can't read it.
function videoSeconds(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement("video")
    video.preload = "metadata"
    const done = (value: number | null) => {
      URL.revokeObjectURL(url)
      resolve(value)
    }
    video.onloadedmetadata = () => done(Number.isFinite(video.duration) ? video.duration : null)
    video.onerror = () => done(null)
    video.src = url
  })
}

function tokenBefore(text: string, caret: number): { token: string; start: number } | null {
  const match = /(^|\s)([@#][\p{L}\p{N}_]*)$/u.exec(text.slice(0, caret))
  if (!match) return null
  return { token: match[2], start: caret - match[2].length }
}

// What the person is told when a post never reaches the server, such as a dropped connection. The text stays in the composer.
const NOT_SENT = "Your post did not send. Check your connection, then try again. Your text is still here."

// A send that gets no answer throws rather than returning a result, and an uncaught throw would replace the whole page with an
// error screen and lose the text. It becomes a refusal instead, so the composer keeps what was written and says why.
async function submitPost(form: FormData): Promise<CreateResult> {
  try {
    return await createPost(form)
  } catch {
    return { ok: false, error: NOT_SENT }
  }
}

export function Composer({ viewer, replyToId, quoteOfId, circle, circles, placeholder, id, compact = false, autoFocus = false, onPosted }: ComposerProps) {
  const router = useRouter()
  const [text, setText] = useState("")
  const [circleChoice, setCircleChoice] = useState("")
  const [caret, setCaret] = useState(0)
  const [media, setMedia] = useState<Attachment[]>([])
  // Pictures waiting to be framed, one at a time. The first one is the dialog on screen.
  const [framing, setFraming] = useState<File[]>([])
  // The photo whose sticker tray is open. The tray sits outside the form, so its events never reach the form's handlers.
  const [trayFor, setTrayFor] = useState<string | null>(null)
  const [poll, setPoll] = useState(false)
  // An article has a title and a longer body. It can carry photos or a video, but not a poll, a thread or a schedule.
  const [article, setArticle] = useState(false)
  const [title, setTitle] = useState("")
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""])
  const [pollMinutes, setPollMinutes] = useState<number>(POLL_DEFAULT_MINUTES)
  const [replySetting, setReplySetting] = useState<ReplySetting>("everyone")
  const [sensitive, setSensitive] = useState(false)
  const [madeWithAi, setMadeWithAi] = useState(false)
  const [scheduling, setScheduling] = useState(false)
  const [schedule, setSchedule] = useState<Schedule>({ date: "", time: "09:00", min: "", max: "" })
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [active, setActive] = useState(0)
  // Thread parts after the first. Each one posts as a reply to the part before it.
  const [extra, setExtra] = useState<string[]>([])
  const [intent, setIntent] = useState<"post" | "draft">("post")
  const [emojiBelow, setEmojiBelow] = useState(false)
  const [pending, startTransition] = useTransition()
  const proof = useProofGate()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)

  const count = countChars(text)
  const limit = article ? MAX_ARTICLE : MAX_POST
  const remaining = limit - count
  const over = remaining < 0
  const pollReady = !poll || pollOptions.filter((o) => o.trim().length > 0).length >= POLL_MIN_OPTIONS
  const hasContent = count > 0 || media.length > 0 || (poll && pollReady)
  const isReply = Boolean(replyToId)
  const scheduledAt = scheduling ? scheduledMs(schedule.date, schedule.time) : null
  const mediaBlocksPoll = poll && media.length > 0
  // A thread is a row of posts sent one after another. Parts after the first are text only, none left empty.
  const threading = extra.length > 0
  const threadReady = extra.every((part) => part.trim().length > 0 && countChars(part) <= MAX_POST)
  const articleReady = !article || (cleanTitle(title).length > 0 && [...cleanTitle(title)].length <= MAX_TITLE)
  const canPost =
    hasContent && !over && !pending && pollReady && !mediaBlocksPoll && (!scheduling || scheduledAt !== null) && threadReady && articleReady
  const canDraft = hasContent && !over && !pending && pollReady && !mediaBlocksPoll && !isReply && !threading && articleReady

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
  // On a phone the submit button shows an icon instead of its words while it sends or schedules, because "Scheduling" is too wide for the row.
  const iconOnlyPhone = sending || scheduling

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

  async function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return
    const picked = Array.from(list)
    const next: Attachment[] = [...media]
    // Pictures (other than animated GIFs) are framed in a dialog first, which also makes them small enough to send.
    const queued: File[] = []
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
          toast.error(`Videos can be up to ${VIDEO_MB} MB.`)
          continue
        }
        // Browsers that can't read a file's length let it through. The server still checks its type and size.
        const seconds = await videoSeconds(file)
        if (seconds !== null && seconds > MAX_VIDEO_SECONDS) {
          toast.error(`Videos can be up to ${MAX_VIDEO_SECONDS} seconds long.`)
          continue
        }
        if (next.length > 0) {
          toast.error("A post can have one video and nothing else.")
          continue
        }
      } else if (file.type === "image/gif") {
        // A GIF moves, so it is sent as it is. It has to fit the upload limit on its own.
        if (file.size > MAX_IMAGE_BYTES) {
          toast.error("Animated GIFs can be up to 4 MB.")
          continue
        }
        if (next.some((m) => m.kind === "video")) {
          toast.error("A post can have one video and nothing else.")
          continue
        }
        if (next.length + framing.length >= MAX_IMAGES) {
          toast.error(`Add up to ${MAX_IMAGES} images.`)
          continue
        }
      } else {
        if (next.some((m) => m.kind === "video")) {
          toast.error("A post can have one video and nothing else.")
          continue
        }
        if (next.length + framing.length + queued.length >= MAX_IMAGES) {
          toast.error(`Add up to ${MAX_IMAGES} images.`)
          continue
        }
        queued.push(file)
        continue
      }
      next.push(makeAttachment(file, isVideo ? "video" : "image"))
    }
    setMedia(next)
    if (queued.length > 0) setFraming((current) => [...current, ...queued])
  }

  // A framed picture joins the post once the person has chosen the part to keep.
  function addFramed(picture: File) {
    setMedia((current) => (current.length >= MAX_IMAGES ? current : [...current, makeAttachment(picture, "image")]))
  }

  function removeMedia(key: string) {
    setMedia((current) => current.filter((m) => m.key !== key))
  }

  // A sticker picked in the tray goes onto the photo the tray was opened for, at a place that doesn't stack on the last one.
  function addSticker(key: string, pick: StickerPick) {
    patchMedia(key, (current) => {
      if (current.aspect === null || current.stickers.length >= MAX_STICKERS) return {}
      const count = current.stickers.length
      const place = { x: 0.5 + ((count % 5) - 2) * 0.06, y: 0.5, rotate: 0 }
      const sticker: Sticker =
        pick.kind === "emoji"
          ? { kind: "emoji", code: pick.code, ...place, size: 0.22 }
          : pick.kind === "text"
            ? { kind: "text", text: pick.text, ...TEXT_LOOK_FIELDS[pick.look], ...place, size: 0.12 }
            : { kind: "hashtag", tag: pick.tag, ...place, size: 0.12 }
      return { stickers: [...current.stickers, sticker], selected: count, editing: false, stickerOpen: true }
    })
  }

  function patchMedia(key: string, patch: MediaPatch) {
    setMedia((current) => current.map((m) => (m.key === key ? { ...m, ...(typeof patch === "function" ? patch(m) : patch) } : m)))
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
      // The stickers of a photo, as a set with the photo's shape. An empty entry keeps the list in step with the files.
      body.append("stickers", m.kind === "image" && m.aspect !== null && m.stickers.length > 0 ? JSON.stringify({ aspect: m.aspect, items: m.stickers }) : "")
    })
    if (article) body.set("title", cleanTitle(title))
    if (poll) {
      body.set("poll", "on")
      body.set("pollMinutes", String(pollMinutes))
      pollOptions.map((o) => o.trim()).filter(Boolean).forEach((o) => body.append("pollOption", o))
    }
    if (replyToId) body.set("replyTo", replyToId)
    if (quoteOfId) body.set("quoteOf", quoteOfId)
    const inCircle = circle?.id ?? (circleChoice || null)
    if (inCircle && !replyToId) body.set("circle", inCircle)
    if (!isReply) body.set("replySetting", replySetting)
    if (media.length > 0 && sensitive) body.set("sensitive", "on")
    if (madeWithAi) body.set("madeWithAi", "on")
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
    setArticle(false)
    setTitle("")
    setSensitive(false)
    setMadeWithAi(false)
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
    // A check asked for by the server is run, and the same part is sent again with its answer.
    const start = (form: FormData) =>
      startTransition(async () => {
      const first = await submitPost(form)
      if (!first.ok) {
        if (first.proofRequired) {
          proof.askForProof((passed) => {
            form.set("proof", passed)
            start(form)
          })
          return
        }
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
        const next = await submitPost(part)
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
    start(head)
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

    // A check asked for by the server is run, and the post is sent again with its answer.
    const publish = (form: FormData) =>
      startTransition(async () => {
      const result = await submitPost(form)
      if (!result.ok) {
        if (result.proofRequired) {
          proof.askForProof((passed) => {
            form.set("proof", passed)
            publish(form)
          })
          return
        }
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
              undoPost(postId)
                .then((undone) => {
                  if (undone.ok) toast.success("Post deleted.")
                  else toast.error(undone.error)
                })
                .catch(() => toast.error("The post could not be deleted. Check your connection, then try again."))
            },
          },
        })
      }
      onPosted?.()
    })
    publish(body)
  }

  // On a new post, a round icon beside the first line of text says who can reply. There is no character count:
  // a post can be as long as the limit allows, and going over it stops the post with a clear message.
  const showReplyPicker = !isReply

  return (
    <>
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
          {article ? (
            <input
              aria-label="Article title"
              placeholder="Title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={MAX_TITLE * 2}
              className="w-full bg-transparent text-2xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground/60"
            />
          ) : null}
          <div className="-mx-2 flex items-start gap-2 rounded-2xl px-2 transition-shadow duration-200 focus-within:shadow-[0_0_0_3px_var(--halo)]">
            <textarea
              data-composer-field
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
            {showReplyPicker ? (
              <div className="shrink-0 pt-0.5 max-sm:pt-1">
                <ReplyPicker value={replySetting} onChange={setReplySetting} />
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

          {framing[0] ? (
            <PhotoCrop
              key={`${framing[0].name}-${framing[0].size}-${framing.length}`}
              file={framing[0]}
              title="Frame your photo"
              aspect={null}
              ratios={FRAME_RATIOS}
              busyLabel="Preparing…"
              onCancel={() => setFraming((current) => current.slice(1))}
              onApply={(picture) => {
                addFramed(picture)
                setFraming((current) => current.slice(1))
              }}
            />
          ) : null}

          {media.length > 0 ? (
            <div className={cn("grid gap-2", media.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
              {media.map((item) => (
                <MediaTile
                  key={item.key}
                  item={item}
                  onRemove={() => removeMedia(item.key)}
                  onPatch={(patch) => patchMedia(item.key, patch)}
                  onOpenTray={() => setTrayFor(item.key)}
                />
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
                    className="h-11 min-w-0 flex-1 rounded-full bg-muted px-4 text-[15px] outline-none transition-[background-color] focus:bg-background"
                  />
                  {[...option].length >= MAX_POLL_OPTION - 5 ? (
                    <span aria-hidden="true" className={cn("w-9 shrink-0 text-right text-xs tabular-nums", [...option].length >= MAX_POLL_OPTION ? "text-destructive" : "text-muted-foreground")}>
                      {[...option].length}/{MAX_POLL_OPTION}
                    </span>
                  ) : null}
                  {pollOptions.length > POLL_MIN_OPTIONS ? (
                    <button
                      type="button"
                      aria-label={`Remove choice ${index + 1}`}
                      onClick={() => setPollOptions((current) => current.filter((_, i) => i !== index))}
                      className="tap-44 grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors duration-200 hover:bg-foreground/5 hover:text-foreground sm:size-9"
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

          {/* Whether the post was made with AI. It is shown as a label on the post. */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-pressed={madeWithAi}
              onClick={() => setMadeWithAi((value) => !value)}
              className={cn(PILL, madeWithAi ? "metal" : "glass text-foreground hover:bg-foreground/5")}
            >
              Made with AI
            </button>
          </div>

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
                      className="tap-44 grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors duration-200 hover:bg-foreground/5 hover:text-foreground sm:size-9"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                )
              })}
            </div>
          ) : null}

          {!isReply && circle ? (
            <p className="flex items-center gap-1.5 pt-1 text-sm text-muted-foreground">
              <CircleDot className="size-4" aria-hidden="true" />
              Posting in <span className="font-semibold text-foreground">{circle.name}</span>
            </p>
          ) : null}
          {!isReply && !circle && circles && circles.length > 0 ? (
            <label className="flex items-center gap-2 pt-1 text-sm">
              <CircleDot className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="text-muted-foreground">Post in</span>
              <select
                aria-label="Post in"
                value={circleChoice}
                onChange={(event) => setCircleChoice(event.target.value)}
                className={cn(FIELD, "h-9 min-w-0 max-w-[16rem] flex-1 text-sm sm:flex-none")}
              >
                <option value="">Everyone (no circle)</option>
                {circles.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {over ? (
            <p role="alert" className="text-sm text-destructive">
              {`${-remaining} ${pluralize(-remaining, "character")} over the limit. Shorten the post to share it.`}
            </p>
          ) : null}
          <div ref={toolbarRef} className="relative flex flex-nowrap items-center gap-0 pt-1 sm:gap-0.5 max-[389px]:flex-wrap max-[389px]:gap-y-1">
            <ToolButton label="Add photos or video" hint="Remove the poll to add photos or video" disabled={poll} onClick={() => fileRef.current?.click()}>
              <ImageIcon className="size-[20px]" strokeWidth={1.8} aria-hidden="true" />
            </ToolButton>
            <ToolButton
              label={poll ? "Remove poll" : "Add a poll"}
              hint="Remove the photos or video to add a poll"
              disabled={media.length > 0 || article}
              pressed={poll}
              onClick={() => setPoll((value) => !value)}
            >
              <ListChecks className="size-[20px]" strokeWidth={1.8} aria-hidden="true" />
            </ToolButton>
            {!isReply && !quoteOfId && !threading && !poll && !scheduling ? (
              <ToolButton
                label={article ? "Turn off article" : "Write an article"}
                hint="Articles can't have polls, threads, replies or quotes"
                pressed={article}
                onClick={() => {
                  setArticle((value) => !value)
                  setTitle("")
                }}
              >
                <FileText className="size-[20px]" strokeWidth={1.8} aria-hidden="true" />
              </ToolButton>
            ) : null}
            {!isReply ? (
              <ToolButton label="Add to thread" hint="Turn off scheduling to start a thread" disabled={scheduling || article} onClick={addThreadPart}>
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

            <div className="ml-auto flex shrink-0 items-center gap-1 pl-1 sm:gap-2 sm:pl-0">
              {poll ? <span className="sr-only">{pollReady ? "Poll ready" : "Add at least two poll choices"}</span> : null}
              {!isReply && !threading ? (
                <button
                  type="button"
                  onClick={() => send(true)}
                  disabled={!canDraft}
                  aria-label="Save draft"
                  title="Save draft"
                  className="tap-44 chrome-ring grid size-9 shrink-0 place-items-center rounded-full text-foreground transition-opacity duration-200 hover:opacity-75 disabled:opacity-35 max-[429px]:size-8 sm:h-9 sm:w-auto sm:px-4 sm:text-[15px] sm:font-semibold"
                >
                  <Save className="size-[17px] sm:hidden" strokeWidth={2} aria-hidden="true" />
                  <span className="hidden sm:inline">{pending && intent === "draft" ? "Saving" : "Save draft"}</span>
                </button>
              ) : null}
              <button
                type="submit"
                disabled={!canPost}
                className={cn(
                  "tap-44 metal inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full text-[15px] font-semibold whitespace-nowrap transition-opacity duration-200 hover:opacity-85 disabled:opacity-35 sm:px-5",
                  iconOnlyPhone ? "w-9 max-[429px]:w-8 sm:w-auto" : "px-3.5"
                )}
              >
                {iconOnlyPhone ? (
                  sending ? (
                    <LoaderCircle className="size-[17px] animate-spin sm:hidden" strokeWidth={2} aria-hidden="true" />
                  ) : (
                    <CalendarClock className="size-[17px] sm:hidden" strokeWidth={2} aria-hidden="true" />
                  )
                ) : null}
                <span className={iconOnlyPhone ? "sr-only sm:not-sr-only" : undefined}>{label}</span>
              </button>
            </div>
          </div>
        </div>
      </form>
    {proof.dialog}
    {trayFor !== null ? (
      <StickerTray
        open
        onOpenChange={(open) => {
          if (!open) setTrayFor(null)
        }}
        onPick={(pick) => addSticker(trayFor, pick)}
      />
    ) : null}
    </>
  )
}
