"use client"

import { useState } from "react"
import { toast } from "sonner"
import { CalendarDays, ContactRound, Download, Eraser, Palette, Search, MoreHorizontal } from "lucide-react"
import { ChatSearchDialog } from "@/components/app/chat-search-dialog"
import { ClearChatDialog } from "@/components/app/clear-chat-dialog"
import { ContactInfoDialog } from "@/components/app/contact-info-dialog"
import { JumpToDateDialog } from "@/components/app/jump-to-date-dialog"
import { MENU_ITEM_PHONE } from "@/components/app/overlay-sizes"
import { WallpaperDialog } from "@/components/app/wallpaper-dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import type { WallpaperKey } from "@/lib/chat-wallpapers"
import { cn } from "@/lib/utils"

// The file name the server gives an export, when the response doesn't say.
const FALLBACK_NAME = "rhenko-chat.txt"

// The chat's own options, from the header: search its words, jump to a day, see who is in it, choose its background, export it,
// and clear this person's copy. Each opens a dialog over the thread, or saves a file.
export function ChatOptionsMenu({ conversationId, wallpaper }: { conversationId: string; wallpaper: WallpaperKey }) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [dateOpen, setDateOpen] = useState(false)
  const [contactOpen, setContactOpen] = useState(false)
  const [wallpaperOpen, setWallpaperOpen] = useState(false)
  const [clearOpen, setClearOpen] = useState(false)

  // Downloads the chat as a text file. A refusal from the server is shown as it is written there.
  async function exportChat() {
    try {
      const response = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}/export`)
      if (!response.ok) {
        toast.error((await response.text()) || "Couldn't export this chat. Try again.")
        return
      }
      const name = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? FALLBACK_NAME
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement("a")
      link.href = url
      link.download = name
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      toast.error("Couldn't export this chat. Check your connection and try again.")
    }
  }

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
          <DropdownMenuItem className={MENU_ITEM_PHONE} onClick={() => setContactOpen(true)}>
            <ContactRound className="size-4" aria-hidden="true" />
            Contact info
          </DropdownMenuItem>
          <DropdownMenuItem className={MENU_ITEM_PHONE} onClick={() => setWallpaperOpen(true)}>
            <Palette className="size-4" aria-hidden="true" />
            Chat wallpaper
          </DropdownMenuItem>
          <DropdownMenuItem className={MENU_ITEM_PHONE} onClick={exportChat}>
            <Download className="size-4" aria-hidden="true" />
            Export chat
          </DropdownMenuItem>
          <DropdownMenuItem className={cn(MENU_ITEM_PHONE, "text-destructive focus:text-destructive")} onClick={() => setClearOpen(true)}>
            <Eraser className="size-4" aria-hidden="true" />
            Clear chat
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {searchOpen ? <ChatSearchDialog conversationId={conversationId} onOpenChange={setSearchOpen} /> : null}
      {dateOpen ? <JumpToDateDialog conversationId={conversationId} onOpenChange={setDateOpen} /> : null}
      {contactOpen ? <ContactInfoDialog conversationId={conversationId} onOpenChange={setContactOpen} /> : null}
      {wallpaperOpen ? <WallpaperDialog conversationId={conversationId} current={wallpaper} onOpenChange={setWallpaperOpen} /> : null}
      {clearOpen ? <ClearChatDialog conversationId={conversationId} onOpenChange={setClearOpen} /> : null}
    </>
  )
}
