// Whether this connection is slow, from the browser's own hints: the person asked to save data, or the connection is 3G or
// slower, or it measures under 1.5 Mbit/s. A browser that does not report these counts as fast, so nothing is held back on it.
// The server cannot know this, so it always answers false and the first paint matches it; the browser's answer follows.

import { useSyncExternalStore } from "react"

type Connection = {
  saveData?: boolean
  effectiveType?: string
  downlink?: number
  addEventListener?: (type: "change", listener: () => void) => void
  removeEventListener?: (type: "change", listener: () => void) => void
}

function connection(): Connection | undefined {
  if (typeof navigator === "undefined") return undefined
  return (navigator as Navigator & { connection?: Connection }).connection
}

export function isSlowConnection(): boolean {
  const hints = connection()
  if (!hints) return false
  if (hints.saveData) return true
  if (hints.effectiveType === "slow-2g" || hints.effectiveType === "2g" || hints.effectiveType === "3g") return true
  return typeof hints.downlink === "number" && hints.downlink < 1.5
}

function subscribe(onChange: () => void): () => void {
  const hints = connection()
  hints?.addEventListener?.("change", onChange)
  return () => hints?.removeEventListener?.("change", onChange)
}

// True on a slow connection. It follows the browser when the connection changes, and is false until the browser is asked.
export function useSlowConnection(): boolean {
  return useSyncExternalStore(subscribe, isSlowConnection, () => false)
}

// The width of a picture to ask for: the 640-pixel variant on a slow connection, otherwise the width given. The server keeps
// a variant at each of these widths, so the smaller one is always there.
export function useImageWidth(full: 640 | 1280): 640 | 1280 {
  return useSlowConnection() ? 640 : full
}
