"use client"

import { useEffect } from "react"
import { markThreadRead } from "@/actions/messages"

// Marks the open conversation as read once it is on screen.
export function ThreadMarker({ handle }: { handle: string }) {
  useEffect(() => {
    void markThreadRead(handle)
  }, [handle])
  return null
}
