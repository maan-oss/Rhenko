"use client"

import { PanelLeft } from "lucide-react"

// A phone's top-left control for the left panel: a sidebar icon. The panel lives with the dock, so this only asks it to open.
export function MenuButton() {
  return (
    <button
      type="button"
      aria-label="Open sidebar"
      title="Open sidebar"
      onClick={() => window.dispatchEvent(new Event("rhenko:open-menu"))}
      className="tap-44 -ml-1 grid size-10 shrink-0 place-items-center rounded-full text-foreground transition-[background-color,transform] duration-200 outline-none select-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring active:bg-foreground/10 lg:hidden"
    >
      <PanelLeft className="size-[22px]" strokeWidth={1.9} aria-hidden="true" />
    </button>
  )
}
