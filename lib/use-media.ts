"use client"

import { useSyncExternalStore } from "react"

// True while the query matches. The server render and the first client paint read false, so the
// phone layout is the default and the desktop version takes over once the browser has answered.
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia(query)
      list.addEventListener("change", notify)
      return () => list.removeEventListener("change", notify)
    },
    () => window.matchMedia(query).matches,
    () => false
  )
}

export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 1024px)")
}
