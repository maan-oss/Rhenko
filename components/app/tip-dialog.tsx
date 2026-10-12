"use client"

import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"
import { startTip, tipOptions } from "@/actions/payments"
import { DIALOG_CLOSE_PHONE, DIALOG_FIT } from "@/components/app/overlay-sizes"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { formatMoney } from "@/lib/money"
import { cn } from "@/lib/utils"

// A tip to the author of a post. The person pays on Stripe's page. The author receives the amount less Rhenko's share,
// which the dialog states before anyone pays.
export function TipDialog({
  open,
  onOpenChange,
  postId,
  handle,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  postId: string
  handle: string
}) {
  const [options, setOptions] = useState<{ amounts: number[]; currency: string; feePercent: number } | null>(null)
  const [failed, setFailed] = useState(false)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (!open || options) return
    let live = true
    tipOptions()
      .then((value) => {
        if (live) setOptions(value)
      })
      .catch(() => {
        if (live) setFailed(true)
      })
    return () => {
      live = false
    }
  }, [open, options])

  const tip = (amount: number) =>
    startTransition(async () => {
      const result = await startTip(postId, amount)
      if (result.ok) window.location.assign(result.url)
      else toast.error(result.error)
    })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("sm:max-w-sm", DIALOG_CLOSE_PHONE, DIALOG_FIT)} showCloseButton>
        <DialogTitle className="text-lg font-semibold">Tip @{handle}</DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">
          {options
            ? `Rhenko keeps ${options.feePercent}% of a tip. The rest goes to @${handle}. Stripe handles the card payment.`
            : failed
              ? "Tips are not available right now."
              : "Loading amounts."}
        </DialogDescription>
        {options && options.amounts.length > 0 ? (
          <div className="flex flex-wrap gap-2 pt-2">
            {options.amounts.map((amount) => (
              <Button key={amount} type="button" variant="outline" disabled={pending} onClick={() => tip(amount)} className="h-11 rounded-full px-5 font-semibold">
                Tip {formatMoney(amount, options.currency)}
              </Button>
            ))}
          </div>
        ) : null}
        <p className="pt-2 text-xs text-muted-foreground">
          A tip is a payment to the creator. Rhenko refunds a tip only when a payment was taken in error. See the terms.
        </p>
      </DialogContent>
    </Dialog>
  )
}
