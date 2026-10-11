"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

type RealtimeEvent = { type: "notification" } | { type: "message"; conversationId: string } | { type: "typing"; conversationId: string; name: string }

// Keeps the open page current. Server events refresh the route; typing events
// go to the open thread through a window event.
export function Realtime() {
  const router = useRouter()
  useEffect(() => {
    if (typeof EventSource === "undefined") return
    let timer: number | undefined
    const source = new EventSource("/api/events")
    const refresh = () => {
      if (timer !== undefined) window.clearTimeout(timer)
      timer = window.setTimeout(() => router.refresh(), 250)
    }
    source.onmessage = (message) => {
      let event: RealtimeEvent
      try {
        event = JSON.parse(message.data) as RealtimeEvent
      } catch {
        return
      }
      if (event.type === "typing") {
        window.dispatchEvent(new CustomEvent("rhenko:typing", { detail: event }))
        return
      }
      refresh()
    }
    return () => {
      if (timer !== undefined) window.clearTimeout(timer)
      source.close()
    }
  }, [router])
  return null
}
