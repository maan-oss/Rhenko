"use client"

import { useEffect } from "react"
import { markNotificationsRead } from "@/actions/notifications"

// Marks everything read after a short pause, so the unread highlight is visible for a moment first.
export function NotificationsMarker() {
  useEffect(() => {
    const id = window.setTimeout(() => {
      void markNotificationsRead()
    }, 1500)
    return () => window.clearTimeout(id)
  }, [])
  return null
}
