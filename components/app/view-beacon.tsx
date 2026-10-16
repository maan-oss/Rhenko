"use client"

import { useEffect, useRef } from "react"
import { recordDwell } from "@/actions/feed"
import { recordViews } from "@/actions/posts"
import type { ClickKind } from "@/lib/post-clicks"

// Two things are measured as a post reaches the screen, for the person looking at it.
// A view counts once per person, when the post's top edge is on screen (recordViews).
// Dwell is how long at least half of the post is on screen, added up (recordDwell). The feed ranks on it.
// Ids and times are batched, so a long feed sends a few requests rather than one per post. A batch the server never received
// is taken back out of `seen`, so those views count the next time the post reaches the screen.
// Clicks on the card are counted by kind as well (clickKind), so the author can see what people open.
const seen = new Set<string>()
const queue = new Set<string>()
let timer: number | undefined

const VIEW_BATCH_MS = 1500
const DWELL_EVERY_MS = 5000
const MAX_DWELL_BATCH = 50
// Milliseconds on screen not yet sent, per post.
const dwell = new Map<string, number>()
// The post ids on screen now, with when each one's current stretch began (performance.now).
const onScreen = new Map<string, number>()
let dwellTimer: number | undefined
let listening = false

function flush() {
  timer = undefined
  const ids = [...queue]
  queue.clear()
  if (ids.length === 0) return
  recordViews(ids).catch(() => {
    for (const id of ids) seen.delete(id)
  })
}

function enqueue(id: string) {
  if (seen.has(id)) return
  seen.add(id)
  queue.add(id)
  if (timer === undefined) timer = window.setTimeout(flush, VIEW_BATCH_MS)
}

// Adds the time since a post's stretch began, and starts the stretch again from now.
function accumulate(postId: string, now: number) {
  const since = onScreen.get(postId)
  if (since === undefined) return
  dwell.set(postId, (dwell.get(postId) ?? 0) + Math.max(0, now - since))
  onScreen.set(postId, now)
}

function scheduleTick() {
  if (dwellTimer === undefined) dwellTimer = window.setTimeout(tick, DWELL_EVERY_MS)
}

// Sends what has been counted so far. Runs every few seconds while anything is on screen, and once more after the last one
// leaves, so the final stretch is not lost.
function tick() {
  dwellTimer = undefined
  const now = performance.now()
  for (const postId of [...onScreen.keys()]) accumulate(postId, now)
  const batch = [...dwell].slice(0, MAX_DWELL_BATCH)
  for (const [postId] of batch) dwell.delete(postId)
  if (batch.length > 0) {
    recordDwell(batch.map(([postId, ms]) => ({ postId, ms: Math.round(ms) }))).catch(() => {})
  }
  if (onScreen.size > 0 || dwell.size > 0) scheduleTick()
}

function startDwell(postId: string) {
  if (!onScreen.has(postId)) onScreen.set(postId, performance.now())
  scheduleTick()
}

function stopDwell(postId: string) {
  if (!onScreen.has(postId)) return
  accumulate(postId, performance.now())
  onScreen.delete(postId)
  scheduleTick()
}

// A tab that goes to the background is not being read, so nothing on it counts until it is shown again. Leaving the page
// sends what is counted.
function leaveAll() {
  const now = performance.now()
  for (const postId of [...onScreen.keys()]) {
    accumulate(postId, now)
    onScreen.delete(postId)
  }
}

function listen() {
  if (listening || typeof document === "undefined") return
  listening = true
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") {
      leaveAll()
      scheduleTick()
    }
  })
  window.addEventListener("pagehide", () => {
    leaveAll()
    tick()
  })
}

// Half of the card on screen counts. A card taller than the screen counts once half of the screen is its own.
function readingNow(entry: IntersectionObserverEntry): boolean {
  if (entry.intersectionRatio >= 0.5) return true
  const root = entry.rootBounds
  return root !== null && entry.intersectionRect.height >= root.height / 2
}

// What a click on the card was for. A link inside a quoted post belongs to that post, so it is not counted here. A link to the
// page the person is already on is not a new click on anything, so it is not counted either.
function clickKind(event: MouseEvent, card: Element): ClickKind | null {
  if (!(event.target instanceof Element)) return null
  if (event.target.closest("[data-media-open]")) return "photo"
  const anchor = event.target.closest("a[href]")
  if (!(anchor instanceof HTMLAnchorElement) || anchor.closest("article") !== card) return null
  const href = anchor.getAttribute("href") ?? ""
  if (/^https?:\/\//.test(href)) return "link"
  if (href.startsWith("/topics/") || href.startsWith("/search?q=")) return "hashtag"
  if (anchor.pathname === window.location.pathname) return null
  if (/^\/[^/]+\/status\/[^/]+$/.test(anchor.pathname)) return "detail"
  if (/^\/[^/]+$/.test(anchor.pathname)) return "profile"
  return null
}

// Sent as a beacon, so the click still counts when it takes the person off the page.
function reportClick(postId: string, kind: ClickKind) {
  const body = new Blob([JSON.stringify({ postId, kind })], { type: "application/json" })
  if (typeof navigator.sendBeacon !== "function" || !navigator.sendBeacon("/api/post-clicks", body)) {
    void fetch("/api/post-clicks", { method: "POST", body, keepalive: true, credentials: "same-origin" }).catch(() => {})
  }
}

export function ViewBeacon({ postId }: { postId: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const element = ref.current
    if (!element || typeof IntersectionObserver === "undefined") return
    listen()
    const views = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          enqueue(postId)
          views.disconnect()
        }
      },
      { threshold: 0.5 }
    )
    views.observe(element)
    // The beacon sits inside the card. Dwell is measured on the whole card.
    const card = element.closest("article") ?? element
    const reading = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (readingNow(entry)) startDwell(postId)
          else stopDwell(postId)
        }
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] }
    )
    reading.observe(card)
    const onClick = (event: MouseEvent) => {
      const kind = clickKind(event, card)
      if (kind) reportClick(postId, kind)
    }
    card.addEventListener("click", onClick)
    return () => {
      views.disconnect()
      reading.disconnect()
      card.removeEventListener("click", onClick)
      stopDwell(postId)
    }
  }, [postId])
  return <span ref={ref} aria-hidden="true" className="pointer-events-none absolute top-0 left-0 h-px w-px" />
}
