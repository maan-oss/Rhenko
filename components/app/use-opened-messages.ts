"use client"

import { useEffect, useRef, useState } from "react"
import { ENCRYPTED_PREVIEW } from "@/lib/e2ee-chat"
import type { MessageView } from "@/lib/data"
import { openSealed, readyDevice, type OpenedText } from "@/lib/e2ee-client"

// The thread's messages with each encrypted one's text filled in from this browser's device. Until a message is opened it reads
// "Encrypted message". The text lives only in this page's memory, and a message is opened once.
export function useOpenedMessages(conversationId: string, messages: MessageView[], encrypted: boolean): MessageView[] {
  const [opened, setOpened] = useState<Record<string, OpenedText>>({})
  const asked = useRef(new Set<string>())
  const sealedNow = useRef<MessageView[]>([])
  // The sealed messages on screen. Kept in an effect so the render itself writes no ref.
  const sealed = messages.filter((message) => message.sealed !== null)
  const sealedKey = sealed.map((message) => message.id).join(",")
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
      if (!message.sealed || asked.current.has(message.id)) return []
      asked.current.add(message.id)
      return [{ id: message.id, envelope: message.sealed.envelope, wrap: message.sealed.wrap }]
    })
    if (todo.length === 0) return
    void openSealed(conversationId, todo).then((results) => setOpened((previous) => ({ ...previous, ...results })))
  }, [conversationId, sealedKey])

  return messages.map((message) => {
    if (message.sealed === null) return message
    const result = opened[message.id]
    if (!result) return { ...message, body: ENCRYPTED_PREVIEW }
    return { ...message, body: result.ok ? result.text : result.error }
  })
}
