"use client"

import { PanelLeft } from "lucide-react"

// A phone's top-left control for the left panel. The panel itself lives in the dock, so this only asks it to open.
export function MenuButton() {
  return (
    <button
      type="button"
      aria-label="Open side panel"
      title="Open side panel"
      onClick={() => window.dispatchEvent(new Event("rhenko:open-menu"))}
      className="grid size-10 shrink-0 place-items-center rounded-full text-foreground transition-colors duration-200 outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
    >
      <PanelLeft className="size-[20px]" strokeWidth={1.9} aria-hidden="true" />
    </button>
  )
}
