"use client"

import { useEffect } from "react"

// Opening a conversation marks it read. Sent as a keepalive request, so it still goes through when the person leaves at once.
export function ThreadMarker({ conversationId }: { conversationId: string }) {
  useEffect(() => {
    void fetch(`/api/conversations/${encodeURIComponent(conversationId)}/read`, {
      method: "POST",
      keepalive: true,
      credentials: "same-origin",
    }).catch(() => undefined)
  }, [conversationId])
  return null
}
