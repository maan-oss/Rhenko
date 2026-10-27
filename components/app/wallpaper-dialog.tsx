"use client"

import { useTransition } from "react"
import { Check } from "lucide-react"
import { toast } from "sonner"
import { setChatWallpaper } from "@/actions/messages"
import { DIALOG_CLOSE_PHONE, DIALOG_FIT } from "@/components/app/overlay-sizes"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { WALLPAPERS, type WallpaperKey } from "@/lib/chat-wallpapers"
import { cn } from "@/lib/utils"

// The background behind this chat's messages, for this person only. Each option shows its own look.
export function WallpaperDialog({
  conversationId,
  current,
  onOpenChange,
}: {
  conversationId: string
  current: WallpaperKey
  onOpenChange: (open: boolean) => void
}) {
  const [pending, startTransition] = useTransition()

  function choose(key: WallpaperKey) {
    if (key === current) {
      onOpenChange(false)
      return
    }
    startTransition(async () => {
      const result = await setChatWallpaper(conversationId, key)
      if (result.ok) {
        toast.success("Wallpaper changed.")
        onOpenChange(false)
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className={cn("sm:max-w-md", DIALOG_CLOSE_PHONE, DIALOG_FIT)}>
        <DialogTitle>Chat wallpaper</DialogTitle>
        <DialogDescription>Only you see this background. The other people in the chat keep theirs.</DialogDescription>
        <div role="radiogroup" aria-label="Wallpaper" className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {WALLPAPERS.map((wallpaper) => {
            const on = wallpaper.key === current
            return (
              <button
                key={wallpaper.key}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={pending}
                onClick={() => choose(wallpaper.key)}
                className="tap-44 group flex flex-col gap-2 rounded-2xl p-1.5 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              >
                <span
                  data-wallpaper={wallpaper.key}
                  className={cn(
                    "relative block h-24 w-full overflow-hidden rounded-xl border border-border bg-background",
                    on && "ring-2 ring-foreground ring-offset-2 ring-offset-background"
                  )}
                >
                  <span className="absolute inset-x-3 top-3 h-5 w-3/5 rounded-full bg-muted" aria-hidden="true" />
                  <span className="absolute inset-x-3 top-11 h-5 w-2/5 self-end rounded-full bg-foreground/80" aria-hidden="true" />
                  {on ? (
                    <span className="absolute right-2 bottom-2 grid size-6 place-items-center rounded-full bg-foreground text-background">
                      <Check className="size-3.5" aria-hidden="true" />
                    </span>
                  ) : null}
                </span>
                <span className="px-1">
                  <span className="block text-[14px] font-semibold">{wallpaper.label}</span>
                  <span className="block text-[12px] text-muted-foreground">{wallpaper.note}</span>
                </span>
              </button>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
