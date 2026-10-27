"use client"

import { useState } from "react"
import { CalendarDays, Eraser, Palette, Search, MoreHorizontal } from "lucide-react"
import { ChatSearchDialog } from "@/components/app/chat-search-dialog"
import { ClearChatDialog } from "@/components/app/clear-chat-dialog"
import { JumpToDateDialog } from "@/components/app/jump-to-date-dialog"
import { MENU_ITEM_PHONE } from "@/components/app/overlay-sizes"
import { WallpaperDialog } from "@/components/app/wallpaper-dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import type { WallpaperKey } from "@/lib/chat-wallpapers"
import { cn } from "@/lib/utils"

// The chat's own options, from the header: search its words, jump to a day, choose its background, and clear this person's copy.
// Each opens a dialog over the thread.
export function ChatOptionsMenu({ conversationId, wallpaper }: { conversationId: string; wallpaper: WallpaperKey }) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [dateOpen, setDateOpen] = useState(false)
  const [wallpaperOpen, setWallpaperOpen] = useState(false)
  const [clearOpen, setClearOpen] = useState(false)

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
          <DropdownMenuItem className={MENU_ITEM_PHONE} onClick={() => setDateOpen(true)}>
            <CalendarDays className="size-4" aria-hidden="true" />
            Jump to a date
          </DropdownMenuItem>
          <DropdownMenuItem className={MENU_ITEM_PHONE} onClick={() => setWallpaperOpen(true)}>
            <Palette className="size-4" aria-hidden="true" />
            Chat wallpaper
          </DropdownMenuItem>
          <DropdownMenuItem className={cn(MENU_ITEM_PHONE, "text-destructive focus:text-destructive")} onClick={() => setClearOpen(true)}>
            <Eraser className="size-4" aria-hidden="true" />
            Clear chat
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {searchOpen ? <ChatSearchDialog conversationId={conversationId} onOpenChange={setSearchOpen} /> : null}
      {dateOpen ? <JumpToDateDialog conversationId={conversationId} onOpenChange={setDateOpen} /> : null}
      {wallpaperOpen ? <WallpaperDialog conversationId={conversationId} current={wallpaper} onOpenChange={setWallpaperOpen} /> : null}
      {clearOpen ? <ClearChatDialog conversationId={conversationId} onOpenChange={setClearOpen} /> : null}
    </>
  )
}
