"use client"

import { useEffect, type RefObject } from "react"
import type { Trim } from "@/lib/trim-rules"

// Keeps a video inside the part chosen for the post. Pressing play from outside the part, or from its last moment, starts at
// its beginning, and playing stops at its end and goes back to the beginning. The end is watched on every frame, because the
// video's own time updates come only four times a second. With `park`, a paused video shows the first frame of the part.
// `src` is the address the video plays: the video is on the page once it is set, which is when the hook takes hold of it.
export function useTrimPlayback(ref: RefObject<HTMLVideoElement | null>, src: string | null, trim: Trim | null, park: boolean) {
  const start = trim?.start ?? null
  const end = trim?.end ?? null

  useEffect(() => {
    const video = ref.current
    if (!video || start === null || end === null) return
    let frame = 0
    const watch = () => {
      if (video.currentTime >= end) {
        video.pause()
        video.currentTime = start
        return
      }
      if (!video.paused) frame = requestAnimationFrame(watch)
    }
    const onPlay = () => {
      if (video.currentTime < start || video.currentTime >= end - 0.05) video.currentTime = start
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(watch)
    }
    video.addEventListener("play", onPlay)
    if (!video.paused) frame = requestAnimationFrame(watch)
    return () => {
      cancelAnimationFrame(frame)
      video.removeEventListener("play", onPlay)
    }
  }, [ref, src, start, end])

  useEffect(() => {
    const video = ref.current
    if (!video || !park || start === null) return
    const show = () => {
      if (video.paused) video.currentTime = start
    }
    if (video.readyState >= 1) show()
    else video.addEventListener("loadedmetadata", show, { once: true })
    return () => video.removeEventListener("loadedmetadata", show)
  }, [ref, src, park, start])
}
