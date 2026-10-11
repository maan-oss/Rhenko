"use client"

import { useActionState, useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react"
import { useFormStatus } from "react-dom"
import { AnimatePresence, motion } from "motion/react"
import { ArrowUp, ImagePlus, Mic } from "lucide-react"
import { sendMessage, signalTyping, type ChatState } from "@/actions/messages"
import { MAX_DM } from "@/lib/rules"
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
  const canSend = text.trim().length > 0 || fileName !== null

  // A confirmed send clears the composer. Adjusted during render, so the text clears on the same frame.
  const [seenState, setSeenState] = useState(state)
  if (seenState !== state) {
    setSeenState(state)
    if (state.sent) {
      setText("")
      setFileName(null)
    }
  }
  useEffect(() => {
    if (state.sent) formRef.current?.reset()
  }, [state])

  // Stop listening when the composer goes away.
  useEffect(() => {
    return () => recognitionRef.current?.abort()
  }, [])

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
      {state.error ? (
        <p role="alert" className="px-4 pt-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      {fileName ? <p className="truncate px-[72px] pt-2 text-xs text-muted-foreground lg:px-4">Photo: {fileName}</p> : null}
      <form
        ref={formRef}
        action={action}
        onSubmit={() => stopDictation()}
        onReset={() => setFileName(null)}
        className="flex items-center gap-2 pt-3 pr-3 pb-6 pl-[72px] lg:pt-2.5 lg:pb-3 lg:pl-3"
      >
        <input type="hidden" name="conversationId" value={conversationId} />
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
