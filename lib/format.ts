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

// The time, a dot, then the date, as X writes it on a post: "8:17 PM · Oct 16, 2026".
export function fullTimestamp(ms: number): string {
  const time = new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  const day = new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  return `${time} · ${day}`
}

export function joinedLabel(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { month: "long", year: "numeric" })
}

// A short label from the browser's user agent string, like "Chrome on Android". The full string is not shown or kept.
export function describeAgent(agent: string): string {
  if (!agent) return "Unknown device"
  const browser = /Edg\//.test(agent) ? "Edge" : /Chrome\//.test(agent) ? "Chrome" : /Firefox\//.test(agent) ? "Firefox" : /Safari\//.test(agent) ? "Safari" : "Browser"
  const os = /iPhone|iPad/.test(agent) ? "iOS" : /Android/.test(agent) ? "Android" : /Mac OS X/.test(agent) ? "macOS" : /Windows/.test(agent) ? "Windows" : /Linux/.test(agent) ? "Linux" : ""
  return os ? `${browser} on ${os}` : browser
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US", { notation: value >= 10000 ? "compact" : "standard" }).format(value)
}

// The word for a count: "1 like", "2 likes". Pass the capitalised forms when the word starts a label.
export function pluralize(count: number, singular: string, plural: string = `${singular}s`): string {
  return count === 1 ? singular : plural
}

// How a call ended: missed or declined before anyone talked, failed when it was answered but never connected, or
// ended after it connected.
export type CallOutcome = "missed" | "declined" | "failed" | "ended"

// The words for a call in the thread and the list, from the viewer's side. Missed means the other person never answered.
// A group call says how many people joined and how long they talked. One nobody joined is a missed group call, and
// the person who started it reads that no one joined.
export function callSummary(outcome: CallOutcome, seconds: number, mine: boolean, kind: "dm" | "group" = "dm", people = 2): string {
  if (kind === "group") {
    if (outcome === "ended") return `Group call · ${people} ${pluralize(people, "person", "people")} · ${formatDuration(seconds)}`
    if (outcome === "failed") return "Group call failed"
    return mine ? "No one joined" : "Missed group call"
  }
  if (outcome === "ended") return `Voice call · ${formatDuration(seconds)}`
  if (outcome === "declined") return mine ? "Declined" : "You declined"
  if (outcome === "failed") return "Call failed"
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
