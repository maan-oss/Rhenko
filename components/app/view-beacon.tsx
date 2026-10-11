"use client"

import { useEffect, useRef } from "react"
import { recordViews } from "@/actions/posts"

// Counts a post as viewed once it reaches the screen. Ids are batched so a
// long feed sends a few requests rather than one per post.
const seen = new Set<string>()
const queue = new Set<string>()
let timer: number | undefined

function flush() {
  timer = undefined
  const ids = [...queue]
  queue.clear()
  if (ids.length > 0) void recordViews(ids)
}

function enqueue(id: string) {
  if (seen.has(id)) return
  seen.add(id)
  queue.add(id)
  if (timer === undefined) timer = window.setTimeout(flush, 1500)
}

export function ViewBeacon({ postId }: { postId: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const element = ref.current
    if (!element || typeof IntersectionObserver === "undefined") return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          enqueue(postId)
          observer.disconnect()
        }
      },
      { threshold: 0.5 }
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [postId])
  return <span ref={ref} aria-hidden="true" className="pointer-events-none absolute top-0 left-0 h-px w-px" />
}
