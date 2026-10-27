"use client"

import { useTransition } from "react"
import { Archive, ArchiveRestore, MoreHorizontal, Pin, PinOff, Star, StarOff } from "lucide-react"
import { toast } from "sonner"
import { toggleConversationArchive, toggleConversationFavourite, toggleConversationPin } from "@/actions/messages"
import { MENU_ITEM_PHONE } from "@/components/app/overlay-sizes"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

// The chat's options from the messages list: pin it to the top, make it a favourite, or archive it. It sits beside the row's link,
// never inside it.
export function ConversationMenu({
  conversationId,
  title,
  pinned,
  archived,
  favourite,
}: {
  conversationId: string
  title: string
  pinned: boolean
  archived: boolean
  favourite: boolean
}) {
  const [pending, startTransition] = useTransition()

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, success: string) {
    startTransition(async () => {
      const result = await action()
      if (result.ok) toast.success(success)
      else toast.error(result.error)
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Options for ${title}`}
        className="tap-44 grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <MoreHorizontal className="size-4" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {archived ? null : (
          <DropdownMenuItem
            className={MENU_ITEM_PHONE}
            disabled={pending}
            onClick={() => run(() => toggleConversationPin(conversationId), pinned ? "Unpinned." : "Pinned to the top.")}
          >
            {pinned ? <PinOff className="size-4" aria-hidden="true" /> : <Pin className="size-4" aria-hidden="true" />}
            {pinned ? "Unpin chat" : "Pin chat"}
          </DropdownMenuItem>
        )}
        {archived ? null : (
          <DropdownMenuItem
            className={MENU_ITEM_PHONE}
            disabled={pending}
            onClick={() =>
              run(() => toggleConversationFavourite(conversationId), favourite ? "Removed from favourites." : "Added to favourites.")
            }
          >
            {favourite ? <StarOff className="size-4" aria-hidden="true" /> : <Star className="size-4" aria-hidden="true" />}
            {favourite ? "Remove from favourites" : "Add to favourites"}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          className={MENU_ITEM_PHONE}
          disabled={pending}
          onClick={() => run(() => toggleConversationArchive(conversationId), archived ? "Chat moved back to your chats." : "Chat archived.")}
        >
          {archived ? <ArchiveRestore className="size-4" aria-hidden="true" /> : <Archive className="size-4" aria-hidden="true" />}
          {archived ? "Unarchive chat" : "Archive chat"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
