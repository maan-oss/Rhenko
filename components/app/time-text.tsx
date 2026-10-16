"use client"

import { useSyncExternalStore } from "react"
import { fullTimestamp, timeAgo } from "@/lib/format"

// Every visible relative time shares one clock that ticks every 30 seconds. The timer
// runs only while a timestamp is on screen and never during server rendering.
const listeners = new Set<() => void>()
let timerId: number | undefined

function subscribeToTime(onChange: () => void) {
  listeners.add(onChange)
  if (timerId === undefined) {
    timerId = window.setInterval(() => listeners.forEach((notify) => notify()), 30_000)
  }
  return () => {
    listeners.delete(onChange)
    if (listeners.size === 0 && timerId !== undefined) {
      window.clearInterval(timerId)
      timerId = undefined
    }
  }
}

// "5s", "3m", "2h", "4d", then a date. The server and the first client render can be a
// few seconds apart, so the element is allowed to differ during hydration; it then
// refreshes on the shared clock.
export function RelativeTime({ at }: { at: number }) {
  const label = useSyncExternalStore(
    subscribeToTime,
    () => timeAgo(at),
    () => timeAgo(at)
  )
  return <span suppressHydrationWarning>{label}</span>
}

function noSubscribe() {
  return () => {}
}

// Clock and date text depend on the reader's time zone, which the server cannot know.
// The server renders an empty element and the reader's local value appears after hydration.
export function LocalTime({
  at,
  variant,
  className,
}: {
  at: number
  variant: "clock" | "day" | "full"
  className?: string
}) {
  const label = useSyncExternalStore(
    noSubscribe,
    () =>
      variant === "clock"
        ? new Date(at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
        : variant === "day"
          ? new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
          : fullTimestamp(at),
    () => ""
  )
  return (
    <time dateTime={new Date(at).toISOString()} className={className}>
      {label}
    </time>
  )
}
