"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import type { RealtimeEvent } from "@/lib/bus"
import { receiveCallSignal } from "@/lib/call-engine"

// Keeps the open page current. Messages and notifications refresh the route. Typing and banners go to the page through
// window events. Call steps go straight to the call engine, which keeps a call going across page changes.
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
      if (event.type === "banner") {
        window.dispatchEvent(new CustomEvent("rhenko:banner", { detail: event }))
        return
      }
      if (event.type === "call") {
        receiveCallSignal(event.callId, event.signal)
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
