"use client"

import { useCallback, useSyncExternalStore } from "react"

// Each chosen file has one preview address, shared by whatever shows it and released when the last of those goes.
// A page kept in the background lets go of its previews and takes them again when it comes back, so a preview never
// points at an address that has been released.
const previewUrls = new Map<File, { url: string; holders: number }>()

function noPreview(): string | null {
  return null
}

export function usePreview(file: File): string | null {
  const subscribe = useCallback(
    (changed: () => void) => {
      let entry = previewUrls.get(file)
      const created = entry === undefined
      if (!entry) {
        entry = { url: URL.createObjectURL(file), holders: 0 }
        previewUrls.set(file, entry)
      }
      entry.holders += 1
      if (created) changed()
      return () => {
        const held = previewUrls.get(file)
        if (!held) return
        held.holders -= 1
        if (held.holders <= 0) {
          URL.revokeObjectURL(held.url)
          previewUrls.delete(file)
        }
      }
    },
    [file]
  )
  const current = useCallback(() => previewUrls.get(file)?.url ?? null, [file])
  return useSyncExternalStore(subscribe, current, noPreview)
}
