"use client"

import { useActionState, useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react"
import { useFormStatus } from "react-dom"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion } from "motion/react"
import { ArrowUp, AudioLines, Camera, FileText, Image as ImageIcon, ListChecks, MapPin, Mic, Music, Plus, ScanLine, UserRound, X } from "lucide-react"
import { toast } from "sonner"
import { sendMessage, signalTyping, type ChatState } from "@/actions/messages"
import { Avatar } from "@/components/app/avatar"
import { addPending, removePending } from "@/components/app/pending-messages"
import { ChatPollDialog, type PollDraft } from "@/components/app/chat-poll-dialog"
import { PhotoCrop, shrinkPhoto } from "@/components/app/photo-crop"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import type { MiniUser } from "@/lib/data"
import { MAX_DM, MAX_DOCUMENT_BYTES, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, MAX_VOICE_SECONDS } from "@/lib/rules"
import { sizeLabel } from "@/lib/message-attachments"
import { cn } from "@/lib/utils"

const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif"
const MEDIA_ACCEPT = `${IMAGE_ACCEPT},video/mp4,video/webm,video/quicktime`
const DOCUMENT_ACCEPT = ".pdf,.txt,.csv,.docx,.xlsx,.pptx,.zip"

// A "@" that starts a mention, with the letters typed after it. Handles are letters, digits and underscores.
const MENTION = /(^|\s)@([A-Za-z0-9_]{0,15})$/

// Browser speech recognition, where the browser has it (Chromium and Safari). Elsewhere the mic is not offered.
type SpokenResult = { isFinal: boolean; 0: { transcript: string } }
type SpeechEvent = { resultIndex: number; results: ArrayLike<SpokenResult> }
type Recognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: SpeechEvent) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}
type RecognitionConstructor = new () => Recognition

function speechConstructor(): RecognitionConstructor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

const noopSubscribe = () => () => {}

// Voice messages are recorded with the browser's recorder, in the first format it can write.
function recordingSupported(): boolean {
  return typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia)
}

function recordingType(): string | undefined {
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((type) => MediaRecorder.isTypeSupported(type))
}

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}

// Adds what was said to what was already typed, with a space between the two.
function joinSpoken(base: string, spoken: string): string {
  if (!spoken) return base
  if (!base) return spoken
  return base.endsWith(" ") ? base + spoken : `${base} ${spoken}`
}

// The message a reply answers, as the thread hands it over.
type ReplyTarget = { id: string; name: string; snippet: string }

// The one attachment a message can carry. Each kind has its own hidden field in the form, and only the picked one is filled.
type Pick =
  | { kind: "media"; file: File; url: string; scan: boolean }
  | { kind: "audio" | "document"; file: File }
  | { kind: "contact"; user: MiniUser }
  | { kind: "location"; lat: number; lng: number }
  | { kind: "poll"; question: string; choices: string[]; multiple: boolean }

// Puts one file into a hidden file input, or empties it. The form submits whatever the input holds.
function fillInput(input: HTMLInputElement | null, file: File | null) {
  if (!input) return
  if (!file) {
    input.value = ""
    return
  }
  const transfer = new DataTransfer()
  transfer.items.add(file)
  input.files = transfer.files
}

// A scan reads as black and white: the paper is lifted to white and the ink pulled to black, so the text stays sharp.
// A large photo is made smaller first, which keeps the work light on a phone.
async function enhanceScan(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 2200 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const context = canvas.getContext("2d")
  if (!context) throw new Error("No canvas to draw the scan on.")
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
  const data = pixels.data
  const count = data.length / 4
  const grey = new Uint8Array(count)
  const histogram = new Uint32Array(256)
  for (let pixel = 0; pixel < count; pixel++) {
    const i = pixel * 4
    const value = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])
    grey[pixel] = value
    histogram[value]++
  }
  // The darkest 1% and the lightest 5% set the black and the white, so stray marks and shadows do not wash the page out.
  let low = 0
  let seen = 0
  while (low < 255 && seen + histogram[low] < count * 0.01) seen += histogram[low++]
  let high = 255
  seen = 0
  while (high > 0 && seen + histogram[high] < count * 0.05) seen += histogram[high--]
  const span = Math.max(1, high - low)
  for (let pixel = 0; pixel < count; pixel++) {
    const value = Math.min(255, Math.max(0, ((grey[pixel] - low) / span) * 255))
    const i = pixel * 4
    data[i] = value
    data[i + 1] = value
    data[i + 2] = value
  }
  context.putImageData(pixels, 0, 0)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92))
  if (!blob) throw new Error("The scan could not be saved.")
  return new File([blob], "scan.jpg", { type: "image/jpeg" })
}

// What the bar above the box says about the attachment waiting to go.
function describePick(pick: Pick): { title: string; detail: string; thumb: ReactNode } {
  const tile = "grid size-14 shrink-0 place-items-center rounded-xl bg-muted text-foreground"
  switch (pick.kind) {
    case "media": {
      const video = pick.file.type.startsWith("video/")
      const thumb = video ? (
        <video src={pick.url} muted playsInline preload="metadata" aria-hidden="true" className="size-14 shrink-0 rounded-xl object-cover" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={pick.url} alt="" className="size-14 shrink-0 rounded-xl object-cover" />
      )
      return { title: pick.scan ? "Scan" : video ? "Video" : "Photo", detail: pick.file.name, thumb }
    }
    case "audio":
      return { title: "Audio file", detail: `${pick.file.name} · ${sizeLabel(pick.file.size)}`, thumb: <span className={tile}><Music className="size-5" aria-hidden="true" /></span> }
    case "document":
      return { title: "Document", detail: `${pick.file.name} · ${sizeLabel(pick.file.size)}`, thumb: <span className={tile}><FileText className="size-5" aria-hidden="true" /></span> }
    case "contact":
      return { title: "Contact", detail: `${pick.user.name} · @${pick.user.handle}`, thumb: <Avatar user={pick.user} size={56} /> }
    case "location":
      return { title: "Location", detail: `${pick.lat.toFixed(5)}, ${pick.lng.toFixed(5)}`, thumb: <span className={tile}><MapPin className="size-5" aria-hidden="true" /></span> }
    case "poll":
      return {
        title: "Poll",
        detail: `${pick.question} · ${pick.choices.length} choices`,
        thumb: <span className={tile}><ListChecks className="size-5" aria-hidden="true" /></span>,
      }
  }
}

function SendButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      aria-label={pending ? "Sending" : "Send"}
      title="Send"
      className="tap-44 grid size-10 shrink-0 place-items-center rounded-full bg-foreground text-background transition-[opacity,transform] duration-200 hover:opacity-85 active:scale-[0.96] disabled:opacity-35"
    >
      <ArrowUp className="size-[19px]" strokeWidth={2.3} aria-hidden="true" />
    </button>
  )
}

// Five bars that rise and fall out of step, shown while the microphone is listening.
function Waveform() {
  return (
    <span className="flex h-4 items-end gap-[3px]" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((bar) => (
        <motion.span
          key={bar}
          className="block h-4 w-[3px] rounded-full bg-foreground"
          style={{ originY: 1 }}
          animate={{ scaleY: [0.3, 1, 0.5, 0.9, 0.35] }}
          transition={{ duration: 1.1, repeat: Infinity, delay: bar * 0.11, ease: "easeInOut" }}
        />
      ))}
    </span>
  )
}

const ATTACH = "tap-44 grid size-10 shrink-0 place-items-center rounded-full text-foreground transition-colors duration-200 hover:bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring"
const ATTACH_ITEM = "min-h-11 gap-3 text-[15px]"

// Sends a message. Enter sends, Shift+Enter starts a new line. Typing is signalled every few seconds.
// One attachment can go with a message: a photo or video, a scan, a document, an audio file, a voice message, a contact, a
// location or a poll. In a group, "@" suggests the people to mention. `people` are the others in the conversation who can be shared.
// The row sits low on the screen; on a phone it leaves room on the left for the folded dock.
export function ChatComposer({ conversationId, people, group }: { conversationId: string; people: MiniUser[]; group: boolean }) {
  const [state, action] = useActionState(sendMessage, {} as ChatState)
  const formRef = useRef<HTMLFormElement>(null)
  const lastSignal = useRef(0)
  const [pick, setPick] = useState<Pick | null>(null)
  // A picture waiting to be framed in the crop dialog. Only the framed part is attached.
  const [framing, setFraming] = useState<{ file: File; scan: boolean } | null>(null)
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const imageRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const scanRef = useRef<HTMLInputElement>(null)
  const documentRef = useRef<HTMLInputElement>(null)
  const audioRef = useRef<HTMLInputElement>(null)
  const [contactOpen, setContactOpen] = useState(false)
  const [pollOpen, setPollOpen] = useState(false)
  const [locating, setLocating] = useState(false)
  const [text, setText] = useState("")
  const [caret, setCaret] = useState(0)
  const [mentionIndex, setMentionIndex] = useState(0)
  // The caret position where a mention list was closed with Escape. It reopens when the caret moves.
  const [mentionDismissedAt, setMentionDismissedAt] = useState<number | null>(null)
  const recognitionRef = useRef<Recognition | null>(null)
  const [listening, setListening] = useState(false)
  const baseRef = useRef("")
  const dictation = useSyncExternalStore(noopSubscribe, () => speechConstructor() !== null, () => false)
  // A voice message is recorded here, kept as a preview, and sent with the form like any other file.
  const [voice, setVoice] = useState<{ file: File; url: string; seconds: number } | null>(null)
  const [recording, setRecording] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [voiceProblem, setVoiceProblem] = useState<string | null>(null)
  const voiceInputRef = useRef<HTMLInputElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startedRef = useRef(0)
  const discardRef = useRef(false)
  const canRecord = useSyncExternalStore(noopSubscribe, recordingSupported, () => false)
  const canSend = recording === null && (text.trim().length > 0 || pick !== null || voice !== null)
  const router = useRouter()
  // The key of the text message waiting for the server, when one was sent as text alone.
  const pendingKey = useRef<string | null>(null)

  // The people a "@" can point to: only in a group, and only the list that shows at the caret.
  const mention = group ? MENTION.exec(text.slice(0, caret)) : null
  const mentionMatches =
    mention && caret !== mentionDismissedAt
      ? people.filter((person) => person.handle.toLowerCase().startsWith(mention[2].toLowerCase())).slice(0, 5)
      : []
  const activeMention = mentionMatches.length > 0 ? Math.min(mentionIndex, mentionMatches.length - 1) : 0

  // Shows text at once, before the server answers. Photos, voice messages and replies wait for the server as before.
  function queueOptimistic() {
    const body = text.trim()
    if (!body || pick !== null || voice !== null || replyTo !== null) return
    const key = crypto.randomUUID()
    pendingKey.current = key
    addPending(conversationId, { key, body, createdAt: Date.now() })
  }

  // A confirmed send clears the composer. Adjusted during render, so the text clears on the same frame.
  const [seenState, setSeenState] = useState(state)
  if (seenState !== state) {
    setSeenState(state)
    if (state.sent) {
      setText("")
      setPick(null)
      setVoice(null)
      setReplyTo(null)
    }
  }
  useEffect(() => {
    if (state.sent) formRef.current?.reset()
  }, [state])

  // A sent text stays in the thread until the saved message arrives; a refresh brings it in. A failed send takes the
  // waiting message away, and the text stays in the box with the error.
  useEffect(() => {
    const key = pendingKey.current
    if (!key) return
    pendingKey.current = null
    if (state.sent) router.refresh()
    else if (state.error) removePending(conversationId, key)
  }, [state, conversationId, router])

  // Stop listening and recording when the composer goes away. A recording that is still running is thrown away.
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort()
      discardRef.current = true
      recorderRef.current?.stop()
    }
  }, [])

  // The preview's address is released when the preview changes or the composer goes away.
  useEffect(() => {
    if (!voice) return
    const url = voice.url
    return () => URL.revokeObjectURL(url)
  }, [voice])

  // The attached recording goes into the form's voice field, where the server reads it like any other file.
  useEffect(() => {
    fillInput(voiceInputRef.current, voice?.file ?? null)
  }, [voice])

  // The chosen attachment goes into its own hidden field. Anything else in the other fields is cleared, so one message
  // never carries two files.
  useEffect(() => {
    fillInput(imageRef.current, pick?.kind === "media" ? pick.file : null)
    fillInput(documentRef.current, pick?.kind === "document" ? pick.file : null)
    fillInput(audioRef.current, pick?.kind === "audio" ? pick.file : null)
  }, [pick])

  // The picture's preview is released when it changes or the composer goes away.
  useEffect(() => {
    if (pick?.kind !== "media") return
    const url = pick.url
    return () => URL.revokeObjectURL(url)
  }, [pick])

  // A reply starts from a message in the thread. The composer shows who is answered and takes the focus.
  useEffect(() => {
    function onReply(event: Event) {
      const detail = (event as CustomEvent<ReplyTarget & { conversationId: string }>).detail
      if (detail.conversationId !== conversationId) return
      setReplyTo({ id: detail.id, name: detail.name, snippet: detail.snippet })
      textRef.current?.focus()
    }
    window.addEventListener("rhenko:reply-to", onReply)
    return () => window.removeEventListener("rhenko:reply-to", onReply)
  }, [conversationId])

  // The elapsed time shown while recording.
  useEffect(() => {
    if (recording === null) return
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - recording) / 1000)), 250)
    return () => window.clearInterval(timer)
  }, [recording])

  function onInput() {
    const now = Date.now()
    if (now - lastSignal.current < 2500) return
    lastSignal.current = now
    void signalTyping(conversationId)
  }

  // A photo or video is made ready to send. A still photo is framed first, so the person picks the part they send; a GIF or a
  // video keeps its movement and goes out as it is. A scan is framed, then made black and white.
  function chooseMedia(input: HTMLInputElement, scan: boolean) {
    const file = input.files?.[0]
    input.value = ""
    if (!file) return
    if (file.type.startsWith("video/")) {
      if (file.size > MAX_VIDEO_BYTES) {
        toast.error("That video is too large to send.")
        return
      }
      void attachMedia(file, false)
      return
    }
    if (scan || file.type !== "image/gif") {
      setFraming({ file, scan })
      return
    }
    void attachMedia(file, false)
  }

  function keepFramed(picture: File, scan: boolean) {
    setFraming(null)
    void attachMedia(picture, scan)
  }

  // A picture over the upload limit is made smaller before it is sent, so a phone photo is never refused for its size.
  async function attachMedia(file: File, scan: boolean) {
    let picture = file
    try {
      if (scan) picture = await enhanceScan(file)
      if (picture.type.startsWith("image/") && picture.size > MAX_IMAGE_BYTES) picture = await shrinkPhoto(picture)
    } catch {
      toast.error("That picture could not be prepared. Try another one.")
      return
    }
    setVoice(null)
    setPick({ kind: "media", file: picture, url: URL.createObjectURL(picture), scan })
  }

  // A document or an audio file is sent as it is.
  function chooseFile(input: HTMLInputElement, kind: "audio" | "document") {
    const file = input.files?.[0]
    input.value = ""
    if (!file) return
    if (kind === "document" && file.size > MAX_DOCUMENT_BYTES) {
      toast.error("That file is too large to send.")
      return
    }
    setVoice(null)
    setPick({ kind, file })
  }

  function chooseContact(user: MiniUser) {
    setContactOpen(false)
    setVoice(null)
    setPick({ kind: "contact", user })
  }

  function choosePoll(poll: PollDraft) {
    setVoice(null)
    setPick({ kind: "poll", question: poll.question, choices: poll.choices, multiple: poll.multiple })
  }

  // The place is read once, when it is asked for, so it is the place the person is standing in.
  function shareLocation() {
    if (!navigator.geolocation) {
      toast.error("This browser can't share a location.")
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false)
        setVoice(null)
        setPick({
          kind: "location",
          lat: Math.round(position.coords.latitude * 1e6) / 1e6,
          lng: Math.round(position.coords.longitude * 1e6) / 1e6,
        })
      },
      () => {
        setLocating(false)
        toast.error("Allow location access to share where you are.")
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    )
  }

  function insertMention(person: MiniUser) {
    const found = MENTION.exec(text.slice(0, caret))
    if (!found) return
    // The "@" starts where the match's own text ends; everything from there to the caret is replaced by the handle.
    const start = caret - found[0].length + found[1].length
    const insert = `@${person.handle} `
    const at = start + insert.length
    setText(text.slice(0, start) + insert + text.slice(caret))
    setCaret(at)
    setMentionDismissedAt(null)
    requestAnimationFrame(() => textRef.current?.setSelectionRange(at, at))
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // While a mention list is open, the arrows choose and Enter or Tab picks; Escape closes the list and keeps the text.
    if (mentionMatches.length > 0) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault()
        const step = event.key === "ArrowDown" ? 1 : -1
        setMentionIndex((activeMention + step + mentionMatches.length) % mentionMatches.length)
        return
      }
      if ((event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) || event.key === "Tab") {
        event.preventDefault()
        const person = mentionMatches[activeMention]
        if (person) insertMention(person)
        return
      }
      if (event.key === "Escape") {
        event.preventDefault()
        setMentionDismissedAt(caret)
        return
      }
    }
    // Escape lets go of the reply first, so the text is kept.
    if (event.key === "Escape" && replyTo) {
      setReplyTo(null)
      return
    }
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      if (canSend) formRef.current?.requestSubmit()
    }
  }

  async function startRecording() {
    setVoiceProblem(null)
    // A voice message goes out alone, so a picked attachment is taken off first.
    setPick(null)
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setVoiceProblem("Allow the microphone to record a voice message.")
      return
    }
    const mimeType = recordingType()
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
    chunksRef.current = []
    discardRef.current = false
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data)
    }
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop())
      recorderRef.current = null
      setRecording(null)
      if (discardRef.current || chunksRef.current.length === 0) return
      const type = (recorder.mimeType || "audio/webm").split(";")[0]
      const blob = new Blob(chunksRef.current, { type })
      const file = new File([blob], "voice-message", { type })
      const seconds = Math.round((Date.now() - startedRef.current) / 1000)
      setVoice({ file, url: URL.createObjectURL(blob), seconds })
    }
    recorderRef.current = recorder
    startedRef.current = Date.now()
    setElapsed(0)
    setRecording(startedRef.current)
    recorder.start()
    // A voice message stops by itself at the limit.
    window.setTimeout(() => {
      if (recorderRef.current === recorder && recorder.state !== "inactive") recorder.stop()
    }, MAX_VOICE_SECONDS * 1000)
  }

  function finishRecording(discard: boolean) {
    discardRef.current = discard
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop()
  }

  function startDictation() {
    const Recognition = speechConstructor()
    if (!Recognition) return
    const recognition = new Recognition()
    recognition.lang = navigator.language || "en-US"
    recognition.continuous = true
    recognition.interimResults = true
    baseRef.current = text
    let settled = ""
    recognition.onresult = (event) => {
      let interim = ""
      for (let index = event.resultIndex; index < event.results.length; index++) {
        const result = event.results[index]
        if (result.isFinal) settled += result[0].transcript
        else interim += result[0].transcript
      }
      setText(joinSpoken(baseRef.current, (settled + interim).trim()))
    }
    recognition.onend = () => {
      recognitionRef.current = null
      setListening(false)
    }
    recognition.onerror = () => {
      recognitionRef.current = null
      setListening(false)
    }
    recognitionRef.current = recognition
    setListening(true)
    recognition.start()
  }

  function stopDictation() {
    recognitionRef.current?.stop()
  }

  const summary = pick ? describePick(pick) : null

  return (
    <div className="sticky bottom-0 z-10 border-t border-border bg-background/95 backdrop-blur">
      {mentionMatches.length > 0 ? (
        <ul
          role="listbox"
          aria-label="Mention someone"
          className="absolute inset-x-3 bottom-full mb-2 max-h-72 overflow-y-auto rounded-2xl border border-border bg-popover p-1 text-popover-foreground shadow-[0_18px_40px_-14px_rgb(0_0_0/0.32),0_2px_8px_-2px_rgb(0_0_0/0.12)] lg:inset-x-auto lg:left-3 lg:w-80"
        >
          {mentionMatches.map((person, index) => (
            <li key={person.id} role="option" aria-selected={index === activeMention}>
              <button
                type="button"
                // The press keeps the focus in the box, so the list can be used from the keyboard as well.
                onMouseDown={(event) => {
                  event.preventDefault()
                  insertMention(person)
                }}
                className={cn("tap-44 flex w-full min-w-0 items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors", index === activeMention && "bg-muted")}
              >
                <Avatar user={person} size={28} />
                <span className="min-w-0 truncate font-semibold">{person.name}</span>
                <span className="min-w-0 truncate text-sm text-muted-foreground">@{person.handle}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {state.error || voiceProblem ? (
        <p role="alert" className="px-4 pt-2 text-sm text-destructive">
          {state.error || voiceProblem}
        </p>
      ) : null}
      {summary && pick ? (
        <div className="flex items-center gap-3 px-4 pt-2 text-sm lg:px-4">
          {summary.thumb}
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{summary.title}</p>
            <p className="truncate text-muted-foreground">{summary.detail}</p>
          </div>
          <button type="button" onClick={() => setPick(null)} className="tap-44 ml-auto shrink-0 rounded-full px-3 py-1 font-semibold transition-colors hover:bg-muted">
            Remove
          </button>
        </div>
      ) : null}
      {locating ? (
        <p role="status" className="px-4 pt-2 text-sm text-muted-foreground">
          Finding your location…
        </p>
      ) : null}
      {replyTo ? (
        <div className="flex items-center gap-3 border-l-2 border-foreground px-4 pt-2 text-sm lg:px-4">
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-foreground">Replying to {replyTo.name}</p>
            <p className="truncate text-muted-foreground">{replyTo.snippet || "Message"}</p>
          </div>
          <button
            type="button"
            aria-label="Cancel reply"
            title="Cancel reply"
            onClick={() => setReplyTo(null)}
            className="tap-44 grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}
      {text.length > MAX_DM * 0.9 ? (
        <p className="px-4 pt-1 text-right text-xs tabular-nums text-muted-foreground lg:px-4" aria-live="polite">
          {[...text].length} / {MAX_DM}
        </p>
      ) : null}
      {recording !== null ? (
        <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 pt-2 text-sm lg:px-4">
          <span aria-hidden="true" className="size-2 shrink-0 animate-pulse rounded-full bg-destructive" />
          <span className="tabular-nums">{clock(elapsed)}</span>
          <span className="min-w-0 text-muted-foreground">Recording a voice message</span>
          <button type="button" onClick={() => finishRecording(true)} className="tap-44 ml-auto rounded-full px-3 py-1 font-semibold transition-colors hover:bg-muted">
            Discard
          </button>
          <button type="button" onClick={() => finishRecording(false)} className="tap-44 rounded-full bg-foreground px-3 py-1 font-semibold text-background">
            Stop
          </button>
        </div>
      ) : null}
      {voice ? (
        <div className="flex flex-wrap items-center gap-3 px-4 pt-2 text-sm lg:px-4">
          <audio controls preload="metadata" src={voice.url} aria-label="Voice message preview" className="h-9 max-w-[260px]" />
          <span className="text-muted-foreground">Voice message · {clock(voice.seconds)}</span>
          <button type="button" onClick={() => setVoice(null)} className="tap-44 ml-auto rounded-full px-3 py-1 font-semibold transition-colors hover:bg-muted">
            Remove
          </button>
        </div>
      ) : null}
      <form
        ref={formRef}
        action={action}
        onSubmit={() => {
          stopDictation()
          queueOptimistic()
        }}
        onReset={() => setPick(null)}
        className="flex items-center gap-2 pt-3 pr-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-2 lg:pt-2.5 lg:pb-3 lg:pl-3"
      >
        <input type="hidden" name="conversationId" value={conversationId} />
        <input type="hidden" name="replyTo" value={replyTo?.id ?? ""} />
        <input type="hidden" name="scan" value={pick?.kind === "media" && pick.scan ? "on" : ""} />
        <input type="hidden" name="contact" value={pick?.kind === "contact" ? pick.user.id : ""} />
        <input type="hidden" name="lat" value={pick?.kind === "location" ? String(pick.lat) : ""} />
        <input type="hidden" name="lng" value={pick?.kind === "location" ? String(pick.lng) : ""} />
        <input
          type="hidden"
          name="poll"
          value={pick?.kind === "poll" ? JSON.stringify({ question: pick.question, choices: pick.choices, multiple: pick.multiple }) : ""}
        />
        {/* The file fields. Each holds only the attachment picked above; the menu opens them from its own items. */}
        <input ref={voiceInputRef} type="file" name="voice" accept="audio/webm,audio/mp4,audio/ogg" className="sr-only" tabIndex={-1} aria-hidden="true" />
        <input
          ref={imageRef}
          type="file"
          name="image"
          accept={MEDIA_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            // A picture goes out alone, so a voice message that was recorded is dropped.
            setVoice(null)
            chooseMedia(event.currentTarget, false)
          }}
        />
        <input
          ref={documentRef}
          type="file"
          name="document"
          accept={DOCUMENT_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => chooseFile(event.currentTarget, "document")}
        />
        <input
          ref={audioRef}
          type="file"
          name="audio"
          accept="audio/*"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => chooseFile(event.currentTarget, "audio")}
        />
        {/* Camera and scan take a photo straight from the camera on a phone. They have no name: their picture moves into the
            image field through the pick, so the form never carries the same picture twice. */}
        <input
          ref={cameraRef}
          type="file"
          accept={IMAGE_ACCEPT}
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => chooseMedia(event.currentTarget, false)}
        />
        <input
          ref={scanRef}
          type="file"
          accept={IMAGE_ACCEPT}
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => chooseMedia(event.currentTarget, true)}
        />

        <DropdownMenu>
          <DropdownMenuTrigger type="button" aria-label="Attach" title="Attach" className={ATTACH}>
            <Plus className="size-[22px]" strokeWidth={2} aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="min-w-56">
            <DropdownMenuItem className={ATTACH_ITEM} onClick={() => imageRef.current?.click()}>
              <ImageIcon className="size-[18px]" aria-hidden="true" />
              Photo or video
            </DropdownMenuItem>
            <DropdownMenuItem className={ATTACH_ITEM} onClick={() => cameraRef.current?.click()}>
              <Camera className="size-[18px]" aria-hidden="true" />
              Camera
            </DropdownMenuItem>
            <DropdownMenuItem className={ATTACH_ITEM} onClick={() => scanRef.current?.click()}>
              <ScanLine className="size-[18px]" aria-hidden="true" />
              Scan a page
            </DropdownMenuItem>
            <DropdownMenuItem className={ATTACH_ITEM} onClick={() => documentRef.current?.click()}>
              <FileText className="size-[18px]" aria-hidden="true" />
              Document
            </DropdownMenuItem>
            <DropdownMenuItem className={ATTACH_ITEM} onClick={() => audioRef.current?.click()}>
              <Music className="size-[18px]" aria-hidden="true" />
              Audio file
            </DropdownMenuItem>
            <DropdownMenuItem className={ATTACH_ITEM} onClick={() => setContactOpen(true)}>
              <UserRound className="size-[18px]" aria-hidden="true" />
              Contact
            </DropdownMenuItem>
            <DropdownMenuItem className={ATTACH_ITEM} onClick={shareLocation}>
              <MapPin className="size-[18px]" aria-hidden="true" />
              Location
            </DropdownMenuItem>
            <DropdownMenuItem className={ATTACH_ITEM} onClick={() => setPollOpen(true)}>
              <ListChecks className="size-[18px]" aria-hidden="true" />
              Poll
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="relative flex min-w-0 flex-1 items-center rounded-[26px] bg-muted transition-[background-color,box-shadow] focus-within:bg-background focus-within:shadow-[0_0_0_3px_var(--halo)]">
          <textarea
            data-composer-field
            ref={textRef}
            name="body"
            rows={1}
            maxLength={MAX_DM}
            value={text}
            onChange={(event) => {
              setText(event.target.value)
              setCaret(event.target.selectionStart)
              setMentionIndex(0)
              onInput()
            }}
            onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
            onKeyDown={onKeyDown}
            placeholder="Start a message"
            aria-label="Message"
            aria-autocomplete={group ? "list" : undefined}
            className="field-sizing-content max-h-40 min-h-10 min-w-0 flex-1 resize-none bg-transparent py-2.5 pl-4 text-[15px] outline-none placeholder:text-muted-foreground"
          />
          <AnimatePresence>
            {listening && text === "" ? (
              // The label stops short of the two buttons on the right, so it never runs under them.
              <motion.div
                key="listening"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="pointer-events-none absolute inset-y-0 left-4 right-[72px] flex min-w-0 items-center gap-2.5 text-[15px] text-muted-foreground"
              >
                <Waveform />
                <span className="truncate">Listening</span>
              </motion.div>
            ) : null}
          </AnimatePresence>
          {canRecord && voice === null && recording === null ? (
            <button
              type="button"
              onClick={() => void startRecording()}
              aria-label="Record a voice message"
              title="Record a voice message"
              className="tap-44 relative mr-0.5 grid size-10 shrink-0 place-items-center rounded-full text-foreground transition-colors hover:bg-muted sm:size-8"
            >
              <AudioLines className="size-5 sm:size-[18px]" strokeWidth={2} aria-hidden="true" />
            </button>
          ) : null}
          {dictation ? (
            <button
              type="button"
              onClick={listening ? stopDictation : startDictation}
              aria-label={listening ? "Stop dictation" : "Dictate a message"}
              aria-pressed={listening}
              title={listening ? "Stop dictation" : "Dictate"}
              className="tap-44 relative mr-0.5 grid size-10 shrink-0 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring sm:size-8"
            >
              <AnimatePresence>
                {listening ? (
                  <motion.span
                    key="ring"
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full bg-foreground"
                    initial={{ scale: 1, opacity: 0.4 }}
                    animate={{ scale: [1, 1.7], opacity: [0.4, 0] }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
                  />
                ) : null}
              </AnimatePresence>
              <span
                className={cn(
                  "relative grid size-10 place-items-center rounded-full transition-colors duration-200 sm:size-8",
                  listening ? "bg-foreground text-background" : "text-foreground hover:bg-muted"
                )}
              >
                <Mic className="size-5 sm:size-[18px]" strokeWidth={2} aria-hidden="true" />
              </span>
            </button>
          ) : null}
        </div>

        <SendButton disabled={!canSend} />
      </form>

      <ChatPollDialog open={pollOpen} onOpenChange={setPollOpen} onCreate={choosePoll} />

      <Dialog open={contactOpen} onOpenChange={setContactOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogTitle>Share a contact</DialogTitle>
          <DialogDescription>Choose someone in this conversation.</DialogDescription>
          {people.length === 0 ? (
            <p className="text-sm text-muted-foreground">There is no one else here to share.</p>
          ) : (
            <ul className="mt-3 flex max-h-[60dvh] flex-col gap-1 overflow-y-auto">
              {people.map((person) => (
                <li key={person.id}>
                  <button
                    type="button"
                    onClick={() => chooseContact(person)}
                    className="tap-44 flex w-full min-w-0 items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-muted"
                  >
                    <Avatar user={person} size={40} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{person.name}</span>
                      <span className="block truncate text-sm text-muted-foreground">@{person.handle}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      {framing ? (
        <PhotoCrop
          key={`${framing.file.name}-${framing.file.size}`}
          file={framing.file}
          title={framing.scan ? "Frame your scan" : "Frame your photo"}
          aspect={null}
          busyLabel="Attaching…"
          onCancel={() => setFraming(null)}
          onApply={(picture) => keepFramed(picture, framing.scan)}
        />
      ) : null}
    </div>
  )
}
