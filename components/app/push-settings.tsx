"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { BellRing, Monitor, Share, Smartphone } from "lucide-react"
import { toast } from "sonner"
import { removePushDevice, setMessagePreviews, turnOffPush, turnOnPush } from "@/actions/push"
import { RelativeTime } from "@/components/app/time-text"
import { ToggleSwitch } from "@/components/app/toggle-switch"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { PUSH_NOT_SET_UP, type PushDeviceView } from "@/lib/notify-rules"

// What this browser can do about push. Browsers differ, and the server can't tell which one is asking, so it is worked out
// here after the page loads.
type Here =
  | "checking"
  // iPhone or iPad in Safari. Push works there only in the app added to the Home Screen.
  | "ios-browser"
  // On the Home Screen, but iOS is older than 16.4.
  | "ios-old"
  | "unsupported"
  // The service worker isn't running. It registers in production builds only (components/app/sw-register.tsx).
  | "no-worker"
  | "blocked"
  | "off"
  | "on"

const STATUS: Record<Exclude<Here, "checking" | "ios-browser">, string> = {
  "ios-old": "Push needs iOS 16.4 or later. Update this device, then turn push on.",
  unsupported: "This browser can't get push notifications.",
  "no-worker": "Push isn't ready on this page. Reload it and try again.",
  blocked: "Notifications are blocked for Rhenko in this browser. Allow them in its site settings, then reload this page.",
  off: "Push is off.",
  on: "Push is on. Alerts arrive even when Rhenko is closed.",
}

type Inspection = { here: Here; registration: ServiceWorkerRegistration | null; subscription: PushSubscription | null; stale: boolean }

export function PushSettings({ publicKey, devices, previews }: { publicKey: string | null; devices: PushDeviceView[]; previews: boolean }) {
  if (!publicKey) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-[15px] text-muted-foreground">{PUSH_NOT_SET_UP}</p>
        {devices.length > 0 ? <DeviceList devices={devices} /> : null}
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-4">
      <ThisDevice publicKey={publicKey} serverOn={devices.some((device) => device.current && device.signedIn)} />
      <PreviewChoice initial={previews} />
      <DeviceList devices={devices} />
    </div>
  )
}

function ThisDevice({ publicKey, serverOn }: { publicKey: string; serverOn: boolean }) {
  const router = useRouter()
  const [here, setHere] = useState<Here>("checking")
  const [pending, startTransition] = useTransition()
  const registration = useRef<ServiceWorkerRegistration | null>(null)
  const subscription = useRef<PushSubscription | null>(null)

  useEffect(() => {
    let cancelled = false
    void inspect(publicKey, serverOn).then((found) => {
      if (cancelled) return
      registration.current = found.registration
      subscription.current = found.subscription
      setHere(found.here)
      // The server still lists this sign-in, but the browser dropped its subscription, so that entry is cleared.
      if (found.stale) {
        void turnOffPush(null).then((result) => {
          if (result.ok) router.refresh()
        })
      }
    })
    return () => {
      cancelled = true
    }
  }, [publicKey, serverOn, router])

  function turnOn() {
    const worker = registration.current
    if (!worker || pending) return
    // Subscribing asks for permission when it's needed. It runs straight from the press, as Safari requires: nothing is
    // awaited before it.
    const subscribing = subscription.current
      ? Promise.resolve(subscription.current)
      : worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) })
    startTransition(async () => {
      let current: PushSubscription
      try {
        current = await subscribing
      } catch {
        if (Notification.permission === "denied") setHere("blocked")
        else toast.error("Push wasn't turned on. Allow notifications when the browser asks.")
        return
      }
      const created = current !== subscription.current
      const result = await turnOnPush(current.toJSON())
      if (!result.ok) {
        if (created) await current.unsubscribe().catch(() => false)
        toast.error(result.error)
        return
      }
      subscription.current = current
      setHere("on")
      toast.success("Push is on for this device.")
      router.refresh()
    })
  }

  function turnOff() {
    if (pending) return
    startTransition(async () => {
      const current = subscription.current
      const result = await turnOffPush(current?.endpoint ?? null)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      // Another account signed in on this browser may still use the subscription. Then the browser keeps it.
      if (current && !result.shared) {
        await current.unsubscribe().catch(() => false)
        subscription.current = null
      }
      setHere("off")
      toast.success("Push is off for this device.")
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <BellRing className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5" aria-live="polite">
          <span className="text-[15px] font-semibold">This device</span>
          {here === "checking" ? (
            <Skeleton className="my-0.5 h-4 w-40" />
          ) : here === "ios-browser" ? (
            <span className="text-sm text-muted-foreground">
              On iPhone and iPad, push works only in the Rhenko app on your Home Screen. In Safari, tap Share
              <Share className="ml-1 inline size-3.5 align-[-2px]" aria-hidden />, then Add to Home Screen. Open Rhenko from there and
              turn push on.
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">{STATUS[here]}</span>
          )}
        </div>
      </div>
      {here === "checking" ? (
        <Skeleton className="h-10 w-full shrink-0 rounded-lg sm:w-56" />
      ) : here === "off" ? (
        <Button type="button" onClick={turnOn} disabled={pending} className="h-10 w-full shrink-0 rounded-lg px-5 sm:w-auto">
          {pending ? "Turning on" : "Turn on push on this device"}
        </Button>
      ) : here === "on" ? (
        <Button type="button" variant="outline" onClick={turnOff} disabled={pending} className="h-10 w-full shrink-0 rounded-lg px-5 sm:w-auto">
          {pending ? "Turning off" : "Turn off"}
        </Button>
      ) : null}
    </div>
  )
}

const PREVIEW_HINT =
  "A push, and the daily email digest, show a message's first words. When this is off, they say only who sent it. Message requests never show a preview."

// When on, a push for a message shows its first words, and so does the email digest. Off by default. The digest section
// shows it too when push is not set up on this server, so the setting can still be reached.
export function PreviewChoice({ initial, hint = PREVIEW_HINT }: { initial: boolean; hint?: string }) {
  const [on, setOn] = useState(initial)
  const [pending, startTransition] = useTransition()

  function toggle() {
    const next = !on
    setOn(next)
    startTransition(async () => {
      const result = await setMessagePreviews(next)
      if (!result.ok) {
        setOn(!next)
        toast.error(result.error)
      }
    })
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Show message previews"
      disabled={pending}
      onClick={toggle}
      className="flex w-full items-center justify-between gap-4 rounded-2xl border border-border bg-card px-4 py-4 text-left transition-colors hover:bg-muted disabled:opacity-50"
    >
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[15px] font-semibold">Show message previews</span>
        <span className="text-sm text-muted-foreground">{hint}</span>
      </span>
      <ToggleSwitch on={on} />
    </button>
  )
}

function DeviceList({ devices }: { devices: PushDeviceView[] }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="px-1 text-[15px] font-semibold">Devices with push</h3>
      {devices.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card px-4 py-4 text-[15px] text-muted-foreground">No devices yet.</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {devices.map((device) => {
            const Icon = /iOS|Android/.test(device.device) ? Smartphone : Monitor
            return (
              <li key={device.id} className="flex items-center gap-3 px-4 py-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted">
                  <Icon className="size-[18px] text-muted-foreground" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold">{device.device}</p>
                  <p className="text-sm text-muted-foreground">
                    {device.signedIn ? (
                      <>
                        Added <RelativeTime at={device.createdAt} /> · Active <RelativeTime at={device.lastSeen} />
                      </>
                    ) : (
                      "Signed out. Push resumes when you sign in there again."
                    )}
                  </p>
                </div>
                {device.current ? (
                  <span className="shrink-0 text-sm font-semibold text-foreground">This device</span>
                ) : (
                  <RemoveDeviceButton id={device.id} label={device.device} />
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function RemoveDeviceButton({ id, label }: { id: string; label: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <Button
      type="button"
      variant="outline"
      disabled={pending}
      aria-label={`Remove ${label}`}
      className="h-8 shrink-0 rounded-full px-3"
      onClick={() =>
        startTransition(async () => {
          const result = await removePushDevice(id)
          if (!result.ok) {
            toast.error(result.error)
            return
          }
          toast.success("That device won't get push any more.")
          router.refresh()
        })
      }
    >
      Remove
    </Button>
  )
}

async function inspect(publicKey: string, serverOn: boolean): Promise<Inspection> {
  const none = { registration: null, subscription: null, stale: false }
  const apple = isAppleMobile()
  if (apple && !isInstalled()) return { ...none, here: "ios-browser" }
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return { ...none, here: apple ? "ios-old" : "unsupported" }
  }
  if (Notification.permission === "denied") return { ...none, here: "blocked" }
  const registration = await workerRegistration()
  if (!registration) return { ...none, here: "no-worker" }
  let subscription = await registration.pushManager.getSubscription()
  // A subscription made with keys the server no longer uses can't receive anything, so it is dropped.
  if (subscription && !sameKey(subscription, publicKey)) {
    await subscription.unsubscribe().catch(() => false)
    subscription = null
  }
  return { here: subscription && serverOn ? "on" : "off", registration, subscription, stale: serverOn && subscription === null }
}

// The registered service worker, once it is running. On a first visit it may still be installing, so production waits a
// few seconds for it. Development never registers one.
async function workerRegistration(): Promise<ServiceWorkerRegistration | null> {
  const found = await navigator.serviceWorker.getRegistration("/")
  if (found?.active) return found
  if (process.env.NODE_ENV !== "production" && !found) return null
  const timeout = new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 4000))
  return await Promise.race([navigator.serviceWorker.ready, timeout])
}

// iPadOS reports itself as a Mac, so a Mac with a touch screen counts too.
function isAppleMobile(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
}

function isInstalled(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(base64url.length / 4) * 4, "=")
  const raw = window.atob(base64)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

// Browsers that don't report the key a subscription was made with are taken to use the current one.
function sameKey(subscription: PushSubscription, publicKey: string): boolean {
  const used = subscription.options?.applicationServerKey
  if (!used) return true
  const mine = keyBytes(publicKey)
  const theirs = new Uint8Array(used)
  return theirs.length === mine.length && theirs.every((byte, i) => byte === mine[i])
}
