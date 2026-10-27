"use client"

import { useState } from "react"
import { Palette, Search, MoreHorizontal } from "lucide-react"
import { ChatSearchDialog } from "@/components/app/chat-search-dialog"
import { MENU_ITEM_PHONE } from "@/components/app/overlay-sizes"
import { WallpaperDialog } from "@/components/app/wallpaper-dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import type { WallpaperKey } from "@/lib/chat-wallpapers"

// The chat's own options, from the header: search its words, and choose its background. Each opens a dialog over the thread.
export function ChatOptionsMenu({ conversationId, wallpaper }: { conversationId: string; wallpaper: WallpaperKey }) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [wallpaperOpen, setWallpaperOpen] = useState(false)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Chat options"
          title="Chat options"
          className="tap-44 grid size-11 place-items-center rounded-full text-foreground transition-colors hover:bg-muted"
        >
          <MoreHorizontal className="size-[22px]" strokeWidth={1.9} aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          <DropdownMenuItem className={MENU_ITEM_PHONE} onClick={() => setSearchOpen(true)}>
            <Search className="size-4" aria-hidden="true" />
            Search in chat
          </DropdownMenuItem>
          <DropdownMenuItem className={MENU_ITEM_PHONE} onClick={() => setWallpaperOpen(true)}>
            <Palette className="size-4" aria-hidden="true" />
            Chat wallpaper
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {searchOpen ? <ChatSearchDialog conversationId={conversationId} onOpenChange={setSearchOpen} /> : null}
      {wallpaperOpen ? <WallpaperDialog conversationId={conversationId} current={wallpaper} onOpenChange={setWallpaperOpen} /> : null}
    </>
  )
}
