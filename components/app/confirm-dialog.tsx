"use client"

import { useState, useTransition, type ReactElement } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { DIALOG_CLOSE_PHONE, DIALOG_FIT } from "@/components/app/overlay-sizes"
import { cn } from "@/lib/utils"

// A confirmation step for anything that can't be undone. The action runs
// only after the person presses the destructive button.
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  action,
  onDone,
  open: controlledOpen,
  onOpenChange,
}: {
  // The element that opens the dialog. It is used as the trigger itself, so it keeps its own button semantics and focus.
  trigger?: ReactElement
  title: string
  description: string
  confirmLabel: string
  action: () => Promise<{ ok: true } | { ok: false; error: string }>
  onDone?: () => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [localOpen, setLocalOpen] = useState(false)
  const open = controlledOpen ?? localOpen
  const setOpen = (value: boolean) => {
    setLocalOpen(value)
    onOpenChange?.(value)
  }
  const [pending, startTransition] = useTransition()
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger !== undefined ? <DialogTrigger render={trigger} /> : null}
      <DialogContent className={cn("sm:max-w-sm", DIALOG_CLOSE_PHONE, DIALOG_FIT)}>
        <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">{description}</DialogDescription>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)} className="h-10 rounded-full px-4 sm:h-9">
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await action()
                if (result.ok) {
                  setOpen(false)
                  onDone?.()
                } else {
                  toast.error(result.error)
                }
              })
            }
            className="h-10 rounded-full px-4 font-semibold sm:h-9"
          >
            {pending ? "Working" : confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
