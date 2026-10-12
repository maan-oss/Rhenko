"use client"

import { useActionState, useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react"
import { useFormStatus } from "react-dom"
import { AnimatePresence, motion } from "motion/react"
import { ArrowUp, AudioLines, ImagePlus, Mic } from "lucide-react"
import { sendMessage, signalTyping, type ChatState } from "@/actions/messages"
import { MAX_DM, MAX_VOICE_SECONDS } from "@/lib/rules"
import { cn } from "@/lib/utils"

const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif"

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

function SendButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      aria-label={pending ? "Sending" : "Send"}
      title="Send"
      className="grid size-10 shrink-0 place-items-center rounded-full bg-dusk text-background transition-[opacity,transform] duration-200 hover:opacity-85 active:scale-[0.96] disabled:opacity-35"
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
          className="block h-4 w-[3px] rounded-full bg-dusk"
          style={{ originY: 1 }}
          animate={{ scaleY: [0.3, 1, 0.5, 0.9, 0.35] }}
          transition={{ duration: 1.1, repeat: Infinity, delay: bar * 0.11, ease: "easeInOut" }}
        />
      ))}
    </span>
  )
}

// Sends a message. Enter sends, Shift+Enter starts a new line. Typing is signalled every few seconds.
// The row sits low on the screen; on a phone it leaves room on the left for the folded dock.
export function ChatComposer({ conversationId }: { conversationId: string }) {
  const [state, action] = useActionState(sendMessage, {} as ChatState)
  const formRef = useRef<HTMLFormElement>(null)
  const lastSignal = useRef(0)
  const [fileName, setFileName] = useState<string | null>(null)
  const [text, setText] = useState("")
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<Recognition | null>(null)
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
  const canSend = recording === null && (text.trim().length > 0 || fileName !== null || voice !== null)

  // A confirmed send clears the composer. Adjusted during render, so the text clears on the same frame.
  const [seenState, setSeenState] = useState(state)
  if (seenState !== state) {
    setSeenState(state)
    if (state.sent) {
      setText("")
      setFileName(null)
      setVoice(null)
    }
  }
  useEffect(() => {
    if (state.sent) formRef.current?.reset()
  }, [state])

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
    const input = voiceInputRef.current
    if (!input) return
    const transfer = new DataTransfer()
    if (voice) transfer.items.add(voice.file)
    input.files = transfer.files
  }, [voice])

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

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      if (canSend) formRef.current?.requestSubmit()
    }
  }

  async function startRecording() {
    setVoiceProblem(null)
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

  return (
    <div className="sticky bottom-0 z-10 border-t border-border bg-background/95 backdrop-blur">
      {state.error || voiceProblem ? (
        <p role="alert" className="px-4 pt-2 text-sm text-destructive">
          {state.error || voiceProblem}
        </p>
      ) : null}
      {fileName ? <p className="truncate px-[72px] pt-2 text-xs text-muted-foreground lg:px-4">Photo: {fileName}</p> : null}
      {recording !== null ? (
        <div role="status" className="flex items-center gap-3 px-[72px] pt-2 text-sm lg:px-4">
          <span aria-hidden="true" className="size-2 shrink-0 animate-pulse rounded-full bg-destructive" />
          <span className="tabular-nums">{clock(elapsed)}</span>
          <span className="text-muted-foreground">Recording a voice message</span>
          <button type="button" onClick={() => finishRecording(true)} className="ml-auto rounded-full px-3 py-1 font-semibold transition-colors hover:bg-muted">
            Discard
          </button>
          <button type="button" onClick={() => finishRecording(false)} className="rounded-full bg-dusk px-3 py-1 font-semibold text-background">
            Stop
          </button>
        </div>
      ) : null}
      {voice ? (
        <div className="flex flex-wrap items-center gap-3 px-[72px] pt-2 text-sm lg:px-4">
          <audio controls preload="metadata" src={voice.url} aria-label="Voice message preview" className="h-9 max-w-[260px]" />
          <span className="text-muted-foreground">Voice message · {clock(voice.seconds)}</span>
          <button type="button" onClick={() => setVoice(null)} className="ml-auto rounded-full px-3 py-1 font-semibold transition-colors hover:bg-muted">
            Remove
          </button>
        </div>
      ) : null}
      <form
        ref={formRef}
        action={action}
        onSubmit={() => stopDictation()}
        onReset={() => setFileName(null)}
        className="flex items-center gap-2 pt-3 pr-3 pb-6 pl-[72px] lg:pt-2.5 lg:pb-3 lg:pl-3"
      >
        <input type="hidden" name="conversationId" value={conversationId} />
        <input ref={voiceInputRef} type="file" name="voice" accept="audio/webm,audio/mp4,audio/ogg" className="sr-only" tabIndex={-1} aria-hidden="true" />
        <label
          className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-full text-dusk transition-colors hover:bg-muted"
          title={fileName ? `Photo: ${fileName}` : "Add a photo"}
        >
          <ImagePlus className="size-[20px]" aria-hidden="true" />
          <span className="sr-only">Add a photo</span>
          <input
            type="file"
            name="image"
            accept={IMAGE_ACCEPT}
            className="sr-only"
            onChange={(event) => setFileName(event.currentTarget.files?.[0]?.name ?? null)}
          />
        </label>

        <div className="relative flex min-w-0 flex-1 items-center rounded-[22px] border border-input bg-background transition-colors focus-within:border-foreground/50">
          <textarea
            name="body"
            rows={1}
            maxLength={MAX_DM}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onInput={onInput}
            onKeyDown={onKeyDown}
            placeholder="Start a message"
            aria-label="Message"
            className="field-sizing-content max-h-40 min-h-10 min-w-0 flex-1 resize-none bg-transparent py-2.5 pl-4 text-[15px] outline-none"
          />
          <AnimatePresence>
            {listening && text === "" ? (
              <motion.div
                key="listening"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="pointer-events-none absolute inset-y-0 left-4 flex items-center gap-2.5 text-[15px] text-muted-foreground"
              >
                <Waveform />
                Listening
              </motion.div>
            ) : null}
          </AnimatePresence>
          {canRecord && voice === null && recording === null ? (
            <button
              type="button"
              onClick={() => void startRecording()}
              aria-label="Record a voice message"
              title="Record a voice message"
              className="relative mr-1 grid size-9 shrink-0 place-items-center rounded-full text-dusk transition-colors hover:bg-muted"
            >
              <AudioLines className="size-[18px]" strokeWidth={2} aria-hidden="true" />
            </button>
          ) : null}
          {dictation ? (
            <button
              type="button"
              onClick={listening ? stopDictation : startDictation}
              aria-label={listening ? "Stop dictation" : "Dictate a message"}
              aria-pressed={listening}
              title={listening ? "Stop dictation" : "Dictate"}
              className="relative mr-1 grid size-9 shrink-0 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <AnimatePresence>
                {listening ? (
                  <motion.span
                    key="ring"
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full bg-dusk"
                    initial={{ scale: 1, opacity: 0.4 }}
                    animate={{ scale: [1, 1.7], opacity: [0.4, 0] }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
                  />
                ) : null}
              </AnimatePresence>
              <span
                className={cn(
                  "relative grid size-9 place-items-center rounded-full transition-colors duration-200",
                  listening ? "bg-dusk text-background" : "text-dusk hover:bg-muted"
                )}
              >
                <Mic className="size-[18px]" strokeWidth={2} aria-hidden="true" />
              </span>
            </button>
          ) : null}
        </div>

        <SendButton disabled={!canSend} />
      </form>
    </div>
  )
}
