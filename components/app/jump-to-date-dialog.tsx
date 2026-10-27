"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { messageOnOrAfter } from "@/actions/messages"
import { DIALOG_CLOSE_PHONE, DIALOG_FIT } from "@/components/app/overlay-sizes"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { dayStartOf } from "@/lib/chat-message-rules"
import { cn } from "@/lib/utils"

// Opens the thread at the first message sent on or after the day picked here.
export function JumpToDateDialog({ conversationId, onOpenChange }: { conversationId: string; onOpenChange: (open: boolean) => void }) {
  const router = useRouter()
  const [day, setDay] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function go() {
    const at = dayStartOf(day)
    if (at === null) {
      setError("Pick a date.")
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await messageOnOrAfter(conversationId, at)
      if (!result.ok) {
        setError(result.error)
        return
      }
      onOpenChange(false)
      router.push(`/messages/${conversationId}?m=${encodeURIComponent(result.id)}`)
    })
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className={cn("sm:max-w-sm", DIALOG_CLOSE_PHONE, DIALOG_FIT)}>
        <DialogTitle>Jump to a date</DialogTitle>
        <DialogDescription>Opens the chat at the first message sent on or after that day.</DialogDescription>
        <form
          className="mt-4 flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            go()
          }}
        >
          <label className="flex flex-col gap-1.5 text-[13px] font-medium text-muted-foreground">
            Date
            <input
              type="date"
              value={day}
              onChange={(event) => {
                setDay(event.target.value)
                setError(null)
              }}
              className="tap-44 rounded-xl border border-border bg-background px-3 text-[15px] font-normal text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || day === ""}>
              {pending ? "Finding…" : "Go"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
