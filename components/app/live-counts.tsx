"use client"

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"

export type Counts = { notifications: number; messages: number }
type LiveCounts = Counts & { refresh: () => void }

const LiveCountsContext = createContext<LiveCounts | null>(null)

// The unread counts behind the navigation badges. The layout sends the numbers each time it renders. A realtime event asks
// the counts endpoint for the new numbers, so a badge moves without re-rendering the page the person is reading.
export function LiveCountsProvider({ initial, children }: { initial: Counts; children: ReactNode }) {
  const [counts, setCounts] = useState(initial)
  // A new layout render brings the numbers the server now has, for example after notifications are marked read. The
  // object is new on each server render and stays the same between client navigations.
  const [fromServer, setFromServer] = useState(initial)
  if (fromServer !== initial) {
    setFromServer(initial)
    setCounts(initial)
  }
  const refresh = useCallback(() => {
    fetch("/api/counts", { cache: "no-store" })
      .then((response) => (response.ok ? (response.json() as Promise<Counts>) : null))
      .then((next) => {
        if (next) setCounts(next)
      })
      .catch(() => {})
  }, [])
  const value = useMemo(() => ({ ...counts, refresh }), [counts, refresh])
  return <LiveCountsContext.Provider value={value}>{children}</LiveCountsContext.Provider>
}

// The live numbers, or null outside the provider, where the caller falls back to the numbers it was given.
export function useLiveCounts(): LiveCounts | null {
  return useContext(LiveCountsContext)
}

const NOOP = () => {}

export function useRefreshCounts(): () => void {
  return useContext(LiveCountsContext)?.refresh ?? NOOP
}
