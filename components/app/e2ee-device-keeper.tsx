"use client"

import { useEffect } from "react"
import { readyDevice } from "@/lib/e2ee-client"

// Gives this browser its encryption device as soon as the app opens, when encrypted chats are on. The others in an encrypted chat
// can only send to someone who has a device, so it is made before anyone needs it. Renders nothing.
export function DeviceKeeper({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return
    readyDevice().catch(() => undefined)
  }, [enabled])
  return null
}
