"use client"

import { useTransition } from "react"
import { toast } from "sonner"
import { clearChat } from "@/actions/messages"
import { DIALOG_CLOSE_PHONE, DIALOG_FIT } from "@/components/app/overlay-sizes"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

// Asks before clearing this person's copy of a chat. Nobody else's copy changes.
export function ClearChatDialog({ conversationId, onOpenChange }: { conversationId: string; onOpenChange: (open: boolean) => void }) {
  const [pending, startTransition] = useTransition()

  function clear() {
    startTransition(async () => {
      const result = await clearChat(conversationId)
      if (result.ok) {
        toast.success("Chat cleared.")
        onOpenChange(false)
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className={cn("sm:max-w-sm", DIALOG_CLOSE_PHONE, DIALOG_FIT)}>
        <DialogTitle>Clear this chat?</DialogTitle>
        <DialogDescription>
          Its messages are removed from your view only. The other people in the chat keep theirs, and new messages still show.
        </DialogDescription>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={clear} disabled={pending}>
            {pending ? "Clearing…" : "Clear chat"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
