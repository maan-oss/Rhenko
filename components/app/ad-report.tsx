"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { reportAd } from "@/actions/ads"
import { DIALOG_CLOSE_PHONE, DIALOG_FIT } from "@/components/app/overlay-sizes"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { FIELD_INPUT } from "@/components/app/form-bits"
import { cn } from "@/lib/utils"

const REASONS = [
  { id: "misleading", label: "It is misleading or a scam" },
  { id: "prohibited", label: "It advertises something not allowed (see the ad policy)" },
  { id: "political", label: "It is political" },
  { id: "other", label: "Something else" },
] as const

// Reports an ad to the people who review advertising. The advertiser is not told who reported it.
export function AdReport({ campaignId }: { campaignId: string }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<string>("")
  const [note, setNote] = useState("")
  const [pending, startTransition] = useTransition()
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="ghost" className="h-9 rounded-full px-3 text-[13px] font-semibold" />}>Report ad</DialogTrigger>
      <DialogContent className={cn("sm:max-w-md", DIALOG_CLOSE_PHONE, DIALOG_FIT)} showCloseButton>
        <DialogTitle className="text-lg font-semibold">Report this ad</DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">
          A person reviews every report. The advertiser is not told who reported the ad.
        </DialogDescription>
        <form
          className="flex flex-col gap-4 pt-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (!reason) {
              toast.error("Choose a reason for the report.")
              return
            }
            startTransition(async () => {
              const result = await reportAd(campaignId, reason, note)
              if (result.ok) {
                toast.success("Thanks. The report has been sent for review.")
                setOpen(false)
                setReason("")
                setNote("")
              } else {
                toast.error(result.error)
              }
            })
          }}
        >
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">Reason</legend>
            {REASONS.map((item) => (
              <label key={item.id} className="flex items-start gap-3 text-[15px]">
                <input type="radio" name="reason" value={item.id} checked={reason === item.id} onChange={() => setReason(item.id)} className="mt-1 size-4 accent-foreground" />
                <span>{item.label}</span>
              </label>
            ))}
          </fieldset>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">Anything else we should know? (optional)</span>
            <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} rows={2} className={cn(FIELD_INPUT, "h-auto py-2")} />
          </label>
          <div className="flex justify-end">
            <Button type="submit" disabled={pending} className="h-10 rounded-full px-5 font-semibold">
              {pending ? "Sending" : "Send report"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
