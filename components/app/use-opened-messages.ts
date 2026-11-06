"use client"

import { useEffect, useRef, useState } from "react"
import { ENCRYPTED_PREVIEW, type SealedAttachmentView } from "@/lib/e2ee-chat"
import type { MessageView } from "@/lib/data"
import { openSealed, readyDevice, type OpenedMessage } from "@/lib/e2ee-client"

type Poll = NonNullable<MessageView["poll"]>
// What a message was opened to, with the envelope it was opened from. An edited message has a new envelope, so its old result is not shown.
type Opened = { envelope: string; result: OpenedMessage }

// The thread's messages with each encrypted one's text and what it carries, filled in from this browser's device. Until a message is
// opened it reads "Encrypted message", and a poll is not shown, because its question and choices are only known once it is opened. The
// text lives only in this page's memory. A message is opened again when its envelope changes, which happens when it is edited. A file's
// bytes are not read here: the bubble fetches and opens them when it shows them.
export function useOpenedMessages(conversationId: string, messages: MessageView[], encrypted: boolean): MessageView[] {
  const [opened, setOpened] = useState<Record<string, Opened>>({})
  // The fingerprint of the envelope each message was last asked to open.
  const asked = useRef(new Map<string, string>())
  const sealedNow = useRef<MessageView[]>([])
  // The sealed messages on screen. Kept in an effect so the render itself writes no ref.
  const sealed = messages.filter((message) => message.sealed !== null)
  const sealedKey = sealed.map((message) => `${message.id}:${fingerprint(message.sealed?.envelope ?? "")}`).join(",")
  useEffect(() => {
    sealedNow.current = sealed
  })

  // An encrypted chat gets this browser's device when it is opened, so the others in the chat can send to it.
  useEffect(() => {
    if (!encrypted) return
    readyDevice().catch(() => undefined)
  }, [encrypted])

  useEffect(() => {
    const todo = sealedNow.current.flatMap((message) => {
      if (!message.sealed) return []
      const mark = fingerprint(message.sealed.envelope)
      if (asked.current.get(message.id) === mark) return []
      asked.current.set(message.id, mark)
      return [{ id: message.id, envelope: message.sealed.envelope, wrap: message.sealed.wrap, file: message.sealed.file }]
    })
    if (todo.length === 0) return
    void openSealed(conversationId, todo).then((results) => {
      setOpened((previous) => {
        const next = { ...previous }
        for (const item of todo) {
          const result = results[item.id]
          if (result) next[item.id] = { envelope: item.envelope, result }
        }
        return next
      })
    })
  }, [conversationId, sealedKey])

  return messages.map((message) => {
    if (message.sealed === null) return message
    const entry = opened[message.id]
    const result = entry && entry.envelope === message.sealed.envelope ? entry.result : undefined
    if (!result) return { ...message, body: ENCRYPTED_PREVIEW, attachment: null, contact: null, poll: null, sealedAttachment: null }
    if (!result.ok) return { ...message, body: result.error, attachment: null, contact: null, poll: null, sealedAttachment: null }
    return {
      ...message,
      body: result.text,
      attachment: null,
      contact: null,
      poll: pollOf(message.poll, result.attachment),
      sealedAttachment: result.attachment,
    }
  })
}

// A sealed poll's votes come from the server. Its question and choices come from the device, and replace the placeholders the server
// keeps for it.
function pollOf(poll: Poll | null, attachment: SealedAttachmentView | null): Poll | null {
  if (!poll || attachment?.kind !== "poll") return null
  const labels = new Map(attachment.options.map((option) => [option.id, option.label]))
  return {
    ...poll,
    question: attachment.question,
    options: poll.options.map((option) => ({ ...option, label: labels.get(option.id) ?? option.label })),
  }
}

// A short fingerprint of an envelope (FNV-1a), so a change to it is seen without comparing the whole text each time.
function fingerprint(envelope: string): string {
  let hash = 2166136261
  for (let index = 0; index < envelope.length; index++) hash = Math.imul(hash ^ envelope.charCodeAt(index), 16777619)
  return `${envelope.length}:${(hash >>> 0).toString(36)}`
}
