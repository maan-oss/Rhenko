"use client"

import { useEffect } from "react"

// Registers the service worker in production builds only, so development reloads stay simple.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return
    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // The app works without offline support, so a failed registration is not an error to show.
    })
  }, [])
  return null
}
