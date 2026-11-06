"use client"

import { createContext, useContext, type ReactNode } from "react"
import type { GifPublicSetup } from "@/lib/gifs"
import { cn } from "@/lib/utils"

// Whether this server offers GIF search, and the provider's name for the panel. The app shell provides it once, so a
// composer decides whether to show its GIF button without asking the server. It never carries the key.
const GifSetupContext = createContext<GifPublicSetup>({ enabled: false })

export function GifSetupProvider({ value, children }: { value: GifPublicSetup; children: ReactNode }) {
  return <GifSetupContext.Provider value={value}>{children}</GifSetupContext.Provider>
}

export function useGifSetup(): GifPublicSetup {
  return useContext(GifSetupContext)
}

// The GIF mark for the buttons: the word in a rounded frame, drawn to the same weight and footprint as the line icons beside it.
export function GifGlyph({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("grid h-[15px] w-[21px] place-items-center rounded-[5px] border-[1.8px] border-current text-[9px] leading-none font-extrabold tracking-[0.02em]", className)}
    >
      GIF
    </span>
  )
}
