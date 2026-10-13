"use client"

import { createContext, useContext, type ReactNode } from "react"

// The languages the signed-in person speaks, and whether this server offers translation at all. The app shell provides
// them once, so any post or message can decide whether to offer a translation without asking the server again.
type Value = { speaks: readonly string[]; translate: boolean }

const ViewerLanguagesContext = createContext<Value>({ speaks: [], translate: false })

export function ViewerLanguages({ speaks, translate, children }: { speaks: readonly string[]; translate: boolean; children: ReactNode }) {
  return <ViewerLanguagesContext.Provider value={{ speaks, translate }}>{children}</ViewerLanguagesContext.Provider>
}

export function useViewerLanguages(): Value {
  return useContext(ViewerLanguagesContext)
}
