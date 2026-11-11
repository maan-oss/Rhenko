"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { DeviceLinkRequired, readyDevice } from "@/lib/e2ee-client"
import { EncryptionSetup } from "@/components/app/encryption-setup"

// How long setup may run before the animation appears, and before the wait is called long. A browser that already has its keys
// finishes inside the first delay, so the animation never flashes on a normal visit.
const SHOW_AFTER_MS = 400
const SLOW_AFTER_MS = 9_000

// Gives this browser its encryption device as soon as the app opens, when encrypted chats are on. The others in an encrypted chat
// can only send to someone who has a device, so it is made before anyone needs it. When the account already has devices, this browser
// has to be linked from one of them, so the app says so once, with a way to the page that does it. While the keys are being made the
// first time, a short setup card covers the page. Otherwise it renders nothing.
export function DeviceKeeper({ enabled }: { enabled: boolean }) {
  const router = useRouter()
  const [phase, setPhase] = useState<"idle" | "setting" | "slow">("idle")

  useEffect(() => {
    if (!enabled) return
    let finished = false
    const showTimer = setTimeout(() => {
      if (!finished) setPhase("setting")
    }, SHOW_AFTER_MS)
    const slowTimer = setTimeout(() => {
      if (!finished) setPhase("slow")
    }, SLOW_AFTER_MS)
    const done = () => {
      finished = true
      clearTimeout(showTimer)
      clearTimeout(slowTimer)
      setPhase("idle")
    }
    readyDevice().then(done, (failure: unknown) => {
      done()
      if (!(failure instanceof DeviceLinkRequired)) return
      toast("Link this browser to read your messages.", {
        duration: 15_000,
        action: { label: "Link", onClick: () => router.push("/settings/devices") },
      })
    })
    return () => {
      finished = true
      clearTimeout(showTimer)
      clearTimeout(slowTimer)
    }
  }, [enabled, router])

  if (phase === "idle") return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card px-6 py-8 shadow-sm">
        <EncryptionSetup slow={phase === "slow"} />
      </div>
    </div>
  )
}
