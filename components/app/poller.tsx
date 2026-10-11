"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

// Refreshes the current page on an interval so new messages and notifications appear without a reload.
export function Poller({ intervalMs = 8000 }: { intervalMs?: number }) {
  const router = useRouter()
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh()
    }, intervalMs)
    return () => window.clearInterval(id)
  }, [router, intervalMs])
  return null
}
