"use client"

import { Avatar, type AvatarUser } from "@/components/app/avatar"

// A phone's top-left control for the left panel, shown as your own avatar, as on X. The panel itself lives in the dock, so this only asks it to open.
export function MenuButton({ viewer }: { viewer: AvatarUser }) {
  return (
    <button
      type="button"
      aria-label="Open side panel"
      title="Open side panel"
      onClick={() => window.dispatchEvent(new Event("rhenko:open-menu"))}
      className="tap-44 -ml-1 grid size-10 shrink-0 place-items-center rounded-full transition-[background-color,transform] duration-200 outline-none select-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
    >
      <Avatar user={viewer} size={32} />
    </button>
  )
}
