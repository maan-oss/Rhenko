export function timeAgo(ms: number, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - ms) / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  const sameYear = new Date(ms).getFullYear() === new Date(now).getFullYear()
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  })
}

export function fullTimestamp(ms: number): string {
  return new Date(ms).toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export function joinedLabel(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { month: "long", year: "numeric" })
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US", { notation: value >= 10000 ? "compact" : "standard" }).format(value)
}

// How a call ended: missed or declined before anyone talked, or ended after it connected.
export type CallOutcome = "missed" | "declined" | "ended"

// The words for a call in the thread and the list, from the viewer's side. Missed means the other person never answered.
export function callSummary(outcome: CallOutcome, seconds: number, mine: boolean): string {
  if (outcome === "ended") return `Voice call · ${formatDuration(seconds)}`
  if (outcome === "declined") return mine ? "Declined" : "You declined"
  return mine ? "No answer" : "Missed call"
}

// A call's length as m:ss, or h:mm:ss past an hour.
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = String(seconds % 60).padStart(2, "0")
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${rest}`
  return `${minutes}:${rest}`
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}
