"use client"

import { useActionState, useEffect, useRef, useState, type KeyboardEvent } from "react"
import { useFormStatus } from "react-dom"
import { ImagePlus } from "lucide-react"
import { sendMessage, signalTyping, type ChatState } from "@/actions/messages"
import { Button } from "@/components/ui/button"
import { MAX_DM } from "@/lib/rules"

const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif"

function SendButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} className="h-10 rounded-full px-4">
      {pending ? "Sending" : "Send"}
    </Button>
  )
}

// Sends a message. Enter sends, Shift+Enter starts a new line. Typing is signalled every few seconds.
export function ChatComposer({ conversationId }: { conversationId: string }) {
  const [state, action] = useActionState(sendMessage, {} as ChatState)
  const formRef = useRef<HTMLFormElement>(null)
  const lastSignal = useRef(0)
  const [fileName, setFileName] = useState<string | null>(null)

  useEffect(() => {
    if (state.sent) formRef.current?.reset()
  }, [state])

  function onInput() {
    const now = Date.now()
    if (now - lastSignal.current < 2500) return
    lastSignal.current = now
    void signalTyping(conversationId)
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      formRef.current?.requestSubmit()
    }
  }

  return (
    <div className="sticky bottom-14 z-10 border-t border-border bg-background/95 backdrop-blur xl:bottom-0">
      {state.error ? (
        <p role="alert" className="px-4 pt-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <form ref={formRef} action={action} onReset={() => setFileName(null)} className="flex items-end gap-2 px-3 py-2.5">
        <input type="hidden" name="conversationId" value={conversationId} />
        <label
          className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-full text-dusk transition-colors hover:bg-muted"
          title={fileName ? `Photo: ${fileName}` : "Add a photo"}
        >
          <ImagePlus className="size-5" aria-hidden="true" />
          <span className="sr-only">Add a photo</span>
          <input
            type="file"
            name="image"
            accept={IMAGE_ACCEPT}
            className="sr-only"
            onChange={(event) => setFileName(event.currentTarget.files?.[0]?.name ?? null)}
          />
        </label>
        <div className="flex min-w-0 flex-1 flex-col">
          {fileName ? <p className="truncate pb-1 text-xs text-muted-foreground">Photo: {fileName}</p> : null}
          <textarea
            name="body"
            rows={1}
            maxLength={MAX_DM}
            placeholder="Start a message"
            aria-label="Message"
            onInput={onInput}
            onKeyDown={onKeyDown}
            className="max-h-40 min-h-10 resize-none rounded-[20px] border border-input bg-background px-4 py-2 text-[15px] outline-none focus-visible:border-foreground/50"
          />
        </div>
        <SendButton />
      </form>
    </div>
  )
}
