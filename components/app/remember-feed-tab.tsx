"use client"

import { useEffect } from "react"
import { FEED_TAB_COOKIE, type HomeTab } from "@/lib/feed-tab"

// Records the home tab on screen, so Home opens on it next time. It writes nothing when the browser refuses cookies, and the
// page works the same without it.
export function RememberFeedTab({ tab }: { tab: HomeTab }) {
  useEffect(() => {
    try {
      document.cookie = `${FEED_TAB_COOKIE}=${tab}; path=/; max-age=31536000; samesite=lax`
    } catch {
      // Nothing to do: Home falls back to For you.
    }
  }, [tab])
  return null
}
