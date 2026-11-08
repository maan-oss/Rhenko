"use client"

import Link from "@/components/app/link"
import { useState, useTransition } from "react"
import { boostPost } from "@/actions/ads"
import { Button } from "@/components/ui/button"
import { formatMoney } from "@/lib/money"

export type BoostOption = { amount: number; views: number }

// The budget choices for a boost. Each shows the most it can spend and about how many views that buys. Sending puts the post
// in review. Nothing runs until a person approves it.
export function BoostForm({
  postId,
  options,
  currency,
  balance,
}: {
  postId: string
  options: BoostOption[]
  currency: string
  // The balance in minor units (cents), as formatMoney takes it.
  balance: number
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)
  const smallest = Math.min(...options.map((option) => option.amount))

  const send = (amount: number) =>
    startTransition(async () => {
      setError(null)
      const result = await boostPost(postId, amount)
      if (result.ok) setSent(result.campaignId)
      else setError(result.error)
    })

  if (sent) {
    return (
      <section className="flex flex-col gap-3 px-4 py-4" aria-live="polite">
        <p className="text-[15px]">Sent for review. A person checks it before it runs, and it is labelled Ad while it runs.</p>
        <Link href={`/advertise/campaigns/${sent}`} className="w-fit font-semibold underline underline-offset-4">
          See this boost
        </Link>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-4 px-4 py-4" aria-labelledby="choose-budget">
      <div className="flex flex-col gap-1">
        <h2 id="choose-budget" className="text-lg font-semibold">
          Choose a budget
        </h2>
        <p className="text-[15px] text-muted-foreground">
          The most this boost can spend. It is paid from your balance, which is {formatMoney(balance, currency)}, one view at a time.
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {options.map((option) => (
          <li key={option.amount}>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => send(option.amount)}
              className="h-auto w-full justify-between rounded-2xl px-4 py-3 text-left"
            >
              <span className="font-semibold">Up to {formatMoney(option.amount * 100, currency)}</span>
              <span className="text-[14px] font-normal text-muted-foreground">About {option.views.toLocaleString("en-US")} views</span>
            </Button>
          </li>
        ))}
      </ul>
      <p className="text-[14px] text-muted-foreground">
        A view is one person seeing the ad on one day. Each person counts once a day, so the real number can be lower than the estimate.
      </p>
      {balance < smallest * 100 ? (
        <p className="text-[15px]">
          Your balance is too low for a boost.{" "}
          <Link href="/advertise" className="font-semibold underline underline-offset-4">
            Add funds
          </Link>{" "}
          first.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-[15px] text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  )
}
