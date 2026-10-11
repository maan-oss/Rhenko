"use client"

import { useEffect } from "react"
import { markConversationRead } from "@/actions/messages"

// Opening a conversation marks it read.
export function ThreadMarker({ conversationId }: { conversationId: string }) {
  useEffect(() => {
    void markConversationRead(conversationId)
  }, [conversationId])
  return null
}
