"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { DeviceLinkRequired, readyDevice } from "@/lib/e2ee-client"

// Gives this browser its encryption device as soon as the app opens, when encrypted chats are on. The others in an encrypted chat
// can only send to someone who has a device, so it is made before anyone needs it. When the account already has devices, this browser
// has to be linked from one of them, so the app says so once, with a way to the page that does it. Renders nothing.
export function DeviceKeeper({ enabled }: { enabled: boolean }) {
  const router = useRouter()
  useEffect(() => {
    if (!enabled) return
    readyDevice().catch((failure: unknown) => {
      if (!(failure instanceof DeviceLinkRequired)) return
      toast("Link this browser to read your encrypted chats.", {
        duration: 15_000,
        action: { label: "Link", onClick: () => router.push("/settings/devices") },
      })
    })
  }, [enabled, router])
  return null
}
