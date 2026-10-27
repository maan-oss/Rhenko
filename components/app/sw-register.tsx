"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { checkInPush } from "@/actions/push"

// Registers the service worker in production builds only, so development reloads stay simple. Where push is allowed, the
// browser's push subscription then checks in, so the server has its current address. A tap on a push opens its page here.
export function ServiceWorkerRegister() {
  const router = useRouter()

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return
    void navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then(checkIn)
      .catch(() => {
        // The app works without offline support or push, so a failed registration is not an error to show.
      })
  }, [])

  // The service worker asks the open tab to go to a tapped notification's page, and loads the page itself when no tab
  // answers. Only a path on this site is followed.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return
    const open = (event: MessageEvent) => {
      const data = event.data as { type?: unknown; url?: unknown } | null
      if (data?.type !== "rhenko:open" || typeof data.url !== "string") return
      if (!data.url.startsWith("/") || data.url.startsWith("//") || data.url.startsWith("/\\")) return
      event.ports[0]?.postMessage("opened")
      router.push(data.url)
    }
    navigator.serviceWorker.addEventListener("message", open)
    return () => navigator.serviceWorker.removeEventListener("message", open)
  }, [router])

  return null
}

async function checkIn(registration: ServiceWorkerRegistration): Promise<void> {
  if (!("pushManager" in registration) || typeof Notification === "undefined" || Notification.permission !== "granted") return
  const subscription = await registration.pushManager.getSubscription()
  if (subscription) await checkInPush(subscription.toJSON())
}
