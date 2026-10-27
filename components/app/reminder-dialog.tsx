"use client"

import { useId, useState, useTransition } from "react"
import { toast } from "sonner"
import { setMessageReminder } from "@/actions/messages"
import { DIALOG_CLOSE_PHONE, DIALOG_FIT } from "@/components/app/overlay-sizes"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

const HOUR = 60 * 60 * 1000
const MINUTE = 60 * 1000

// The quick choices, worked out in the device's time zone from the moment the dialog opened. A choice that has already passed is left out.
function quickChoices(openedAt: number): { label: string; at: number }[] {
  const now = new Date(openedAt)
  const choices = [{ label: "In 1 hour", at: openedAt + HOUR }]
  const evening = new Date(openedAt)
  evening.setHours(20, 0, 0, 0)
  if (evening.getTime() > openedAt + MINUTE) choices.push({ label: "This evening, 8:00 pm", at: evening.getTime() })
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(9, 0, 0, 0)
  choices.push({ label: "Tomorrow, 9:00 am", at: tomorrow.getTime() })
  return choices
}

// The value a date and time field takes for a moment, in the device's time zone: "2026-10-27T14:05".
function localInputValue(at: number): string {
  const date = new Date(at)
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// Asks to be reminded of a message at a time. The time is given as the moment the dialog opened, so the choices are the same all
// the while it is open.
export function ReminderDialog({ messageId, openedAt, onOpenChange }: { messageId: string; openedAt: number; onOpenChange: (open: boolean) => void }) {
  const [pending, startTransition] = useTransition()
  const [custom, setCustom] = useState(() => localInputValue(openedAt + HOUR))
  const fieldId = useId()
  const choices = quickChoices(openedAt)

  function set(at: number) {
    startTransition(async () => {
      const result = await setMessageReminder(messageId, at)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("Reminder set.")
      onOpenChange(false)
    })
  }

  function setCustomTime() {
    const at = new Date(custom).getTime()
    if (!Number.isFinite(at)) {
      toast.error("Pick a date and time for the reminder.")
      return
    }
    set(at)
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className={cn("sm:max-w-sm", DIALOG_CLOSE_PHONE, DIALOG_FIT)}>
        <DialogTitle>Remind me</DialogTitle>
        <DialogDescription>We&apos;ll bring this message back to you at the time you pick.</DialogDescription>
        <div className="mt-4 flex flex-col gap-2">
          {choices.map((choice) => (
            <Button key={choice.label} type="button" variant="outline" disabled={pending} onClick={() => set(choice.at)} className="h-11 justify-start rounded-xl px-4 text-[15px]">
              {choice.label}
            </Button>
          ))}
        </div>
        <div className="mt-5 border-t border-border pt-4">
          <label htmlFor={fieldId} className="text-sm font-semibold">
            Another time
          </label>
          <div className="mt-2 flex items-center gap-2">
            <input
              id={fieldId}
              type="datetime-local"
              value={custom}
              onChange={(event) => setCustom(event.target.value)}
              className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button type="button" disabled={pending || custom === ""} onClick={setCustomTime} className="h-11 rounded-xl px-4">
              Set
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
