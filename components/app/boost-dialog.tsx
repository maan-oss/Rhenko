"use client"

import Link from "@/components/app/link"
import { useEffect, useState, useTransition } from "react"
import { boostBudgetOptions, boostPost } from "@/actions/ads"
import { DIALOG_CLOSE_PHONE, DIALOG_FIT } from "@/components/app/overlay-sizes"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { formatMoney } from "@/lib/money"
import { cn } from "@/lib/utils"

// Boosting a post makes it an ad. It is labelled Ad, a person reviews it first, and the budget is spent as people see it.
export function BoostDialog({ open, onOpenChange, postId }: { open: boolean; onOpenChange: (open: boolean) => void; postId: string }) {
  const [options, setOptions] = useState<{ amounts: number[]; currency: string } | null>(null)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsAccount, setNeedsAccount] = useState(false)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (!open || options) return
    let live = true
    boostBudgetOptions()
      .then((value) => {
        if (live) setOptions(value)
      })
      .catch(() => {
        if (live) setError("Boosts are not available right now.")
      })
    return () => {
      live = false
    }
  }, [open, options])

  const boost = (dollars: number) =>
    startTransition(async () => {
      setError(null)
      const result = await boostPost(postId, dollars)
      if (result.ok) {
        setSent(true)
        return
      }
      setError(result.error)
      setNeedsAccount(result.needsAccount === true)
    })

  const close = (next: boolean) => {
    onOpenChange(next)
    if (!next) {
      setSent(false)
      setError(null)
      setNeedsAccount(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className={cn("sm:max-w-sm", DIALOG_CLOSE_PHONE, DIALOG_FIT)} showCloseButton>
        <DialogTitle className="text-lg font-semibold">Boost this post</DialogTitle>
        {sent ? (
          <DialogDescription className="text-sm text-muted-foreground">
            Sent for review. Once a person approves it, the post runs as an ad labelled Ad. Its views are paid from your advertising
            balance, and it stops when the budget is used. Follow it on Advertising.
          </DialogDescription>
        ) : (
          <>
            <DialogDescription className="text-sm text-muted-foreground">
              Choose the most you will spend. The post is shown in home feeds, labelled Ad, to adults who do not pay for Plus. A person
              reviews the boost before it runs.
            </DialogDescription>
            {options ? (
              <div className="flex flex-wrap gap-2 pt-2">
                {options.amounts.map((amount) => (
                  <Button key={amount} type="button" variant="outline" disabled={pending} onClick={() => boost(amount)} className="h-11 rounded-full px-5 font-semibold">
                    Up to {formatMoney(amount * 100, options.currency)}
                  </Button>
                ))}
              </div>
            ) : null}
            {error ? <p className="pt-2 text-sm text-destructive">{error}</p> : null}
            {needsAccount ? (
              <Link href="/advertise" className="pt-2 text-sm font-semibold underline">
                Set up advertising
              </Link>
            ) : null}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
