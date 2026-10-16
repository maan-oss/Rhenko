"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import type { RealtimeEvent } from "@/lib/bus"
import { attachCalls, receiveCallEvent, receiveHello } from "@/lib/call-engine"
import { useRefreshCounts } from "@/components/app/live-counts"

// After the stream is refused (a sign-in that ended), it is tried again this much later.
const RETRY_MS = 15_000

// The feeds show posts, not notifications or messages. A notification on them moves the badge and nothing else, so the
// feed is not rendered again for it.
const FEED_PATHS = ["/", "/explore", "/search", "/topics", "/bookmarks", "/circles", "/lists"]

function onFeed(path: string): boolean {
  return FEED_PATHS.some((feed) => (feed === "/" ? path === "/" : path === feed || path.startsWith(`${feed}/`)))
}

// Keeps the open page current. A notification refreshes the page unless it is a feed; a message refreshes the messages
// pages. The badges move in both cases. Typing, banners and new posts go to the page through window events. Call steps
// go straight to the call engine, which keeps a call going across page changes. The stream belongs to one account:
// switching accounts opens a new one.
export function Realtime({ viewerId }: { viewerId: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const path = useRef(pathname)
  const refreshCounts = useRefreshCounts()
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    path.current = pathname
  }, [pathname])

  useEffect(() => {
    if (typeof EventSource === "undefined") return
    attachCalls(viewerId)
    let timer: number | undefined
    let retry: number | undefined
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
      switch (event.type) {
        case "hello":
          receiveHello(event.bootId)
          return
        case "call":
          receiveCallEvent(event)
          return
        case "typing":
          window.dispatchEvent(new CustomEvent("rhenko:typing", { detail: event }))
          return
        case "banner":
          window.dispatchEvent(new CustomEvent("rhenko:banner", { detail: event }))
          return
        // A new post from someone the person follows. The feed shows a pill for it; the page does not reload.
        case "posts":
          window.dispatchEvent(new CustomEvent("rhenko:posts", { detail: event }))
          return
        case "notification":
          refreshCounts()
          if (!onFeed(path.current)) refresh()
          return
        case "message":
          refreshCounts()
          if (path.current.startsWith("/messages")) refresh()
          return
        default:
          refresh()
      }
    }
    // The browser reconnects on its own after a dropped connection. A refused one stays closed: the page refreshes,
    // which signs out a session that ended, and the stream is tried again later.
    source.onerror = () => {
      if (source.readyState !== EventSource.CLOSED || retry !== undefined) return
      router.refresh()
      retry = window.setTimeout(() => setAttempt((count) => count + 1), RETRY_MS)
    }
    // A page restored from the back-forward cache has a closed stream; open a new one.
    const onShow = (event: PageTransitionEvent) => {
      if (event.persisted) setAttempt((count) => count + 1)
    }
    window.addEventListener("pageshow", onShow)
    return () => {
      if (timer !== undefined) window.clearTimeout(timer)
      if (retry !== undefined) window.clearTimeout(retry)
      window.removeEventListener("pageshow", onShow)
      source.close()
    }
  }, [router, viewerId, attempt, refreshCounts])
  return null
}
