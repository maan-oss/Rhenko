"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { endCampaign, setCampaignPaused } from "@/actions/ads"
import { Button } from "@/components/ui/button"

type Status = "in_review" | "rejected" | "active" | "paused" | "ended"

// Pause, start again, or end. Ending is final, so it asks first. Money not yet spent stays in the balance.
export function CampaignControls({ campaignId, status, isBoost }: { campaignId: string; status: Status; isBoost: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canPause = status === "active"
  const canResume = status === "paused"
  const canEnd = status === "in_review" || status === "active" || status === "paused"
  if (!canPause && !canResume && !canEnd) return null

  const endLabel = status === "in_review" ? "Withdraw" : isBoost ? "End boost" : "End campaign"
  const noun = isBoost ? "boost" : "campaign"
  const confirmText =
    status === "in_review"
      ? `The ${noun} will not run, and nothing is charged. Money not yet spent stays in your balance.`
      : `This ${noun} stops now and cannot be started again. Money not yet spent stays in your balance.`

  const act = (run: () => Promise<{ ok: true } | { ok: false; error: string }>) =>
    startTransition(async () => {
      setError(null)
      const result = await run()
      if (result.ok) {
        setConfirming(false)
        router.refresh()
      } else {
        setError(result.error)
      }
    })

  return (
    <section aria-label="Manage" className="flex flex-col gap-3 border-t border-border px-4 py-4">
      <div className="flex flex-wrap gap-2">
        {canPause ? (
          <Button type="button" variant="outline" disabled={pending} onClick={() => act(() => setCampaignPaused(campaignId, true))} className="h-10 rounded-full px-5 font-semibold">
            Pause
          </Button>
        ) : null}
        {canResume ? (
          <Button type="button" variant="outline" disabled={pending} onClick={() => act(() => setCampaignPaused(campaignId, false))} className="h-10 rounded-full px-5 font-semibold">
            Resume
          </Button>
        ) : null}
        {canEnd && !confirming ? (
          <Button type="button" variant="outline" disabled={pending} onClick={() => setConfirming(true)} className="h-10 rounded-full px-5 font-semibold">
            {endLabel}
          </Button>
        ) : null}
      </div>
      {confirming ? (
        <div className="flex flex-col gap-3">
          <p className="text-[15px]">{confirmText}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="destructive" disabled={pending} onClick={() => act(() => endCampaign(campaignId))} className="h-10 rounded-full px-5 font-semibold">
              {pending ? "Ending" : `Yes, ${endLabel.toLowerCase()}`}
            </Button>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setConfirming(false)} className="h-10 rounded-full px-5 font-semibold">
              Go back
            </Button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-[15px] text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  )
}
