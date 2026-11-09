"use client"

import { useEffect } from "react"

// Records a profile visit when the profile opens. The server counts each person once per window. It is sent as a beacon, so it
// is not queued behind the page's own requests and still goes through when the person leaves the page at once.
export function ProfileVisit({ profileId }: { profileId: string }) {
  useEffect(() => {
    const body = new Blob([JSON.stringify({ profileId })], { type: "application/json" })
    if (typeof navigator.sendBeacon !== "function" || !navigator.sendBeacon("/api/profile-visits", body)) {
      void fetch("/api/profile-visits", { method: "POST", body, keepalive: true, credentials: "same-origin" }).catch(() => {})
    }
  }, [profileId])
  return null
}
