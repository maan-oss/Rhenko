"use client"

import Link from "@/components/app/link"
import { useState, useTransition } from "react"
import { boostPost } from "@/actions/ads"
import { Button } from "@/components/ui/button"
import { formatMoney } from "@/lib/money"

export type BoostOption = { amount: number; views: number }

// Pick the most a boost may spend, then send it for review. Each choice shows about how many views it buys. The second
// choice is picked to start, which is where most posts land. Sending puts the boost in review. Nothing runs until a person
// approves it.
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
  const [selected, setSelected] = useState<number>(options[1]?.amount ?? options[0]?.amount ?? 0)
  const smallest = Math.min(...options.map((option) => option.amount))
  const canAfford = balance >= smallest * 100

  const send = () =>
    startTransition(async () => {
      setError(null)
      const result = await boostPost(postId, selected)
      if (result.ok) setSent(result.campaignId)
      else setError(result.error)
    })

  if (sent) {
    return (
      <section aria-live="polite" className="flex flex-col gap-4 border-t border-border px-4 py-5">
        <div className="flex flex-col gap-1">
          <p className="text-[17px] font-semibold">Sent for review</p>
          <p className="text-[15px] text-muted-foreground">A person checks it before it runs. While it runs, it is labelled Ad.</p>
        </div>
        <Link
          href={`/advertise/campaigns/${sent}`}
          className="inline-flex h-11 w-fit items-center rounded-full border border-border px-5 text-[15px] font-semibold transition-colors duration-200 hover:bg-muted"
        >
          See this boost
        </Link>
      </section>
    )
  }

  return (
    <section aria-labelledby="choose-budget" className="flex flex-col">
      <div className="flex flex-col gap-1 px-4 pt-5 pb-3">
        <h2 id="choose-budget" className="text-base font-semibold">
          Budget
        </h2>
        <p className="text-pretty text-[15px] text-muted-foreground">
          The most this boost can spend. Your balance is {formatMoney(balance, currency)}.
        </p>
      </div>
      <div role="radiogroup" aria-labelledby="choose-budget" className="flex flex-col">
        {options.map((option) => {
          const checked = option.amount === selected
          return (
            <label
              key={option.amount}
              className="flex cursor-pointer items-center gap-4 border-t border-border px-4 py-4 transition-colors duration-200 hover:bg-muted/50 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
            >
              <input
                type="radio"
                name="boost-budget"
                value={option.amount}
                checked={checked}
                disabled={pending}
                onChange={() => setSelected(option.amount)}
                className="peer sr-only"
              />
              <span
                aria-hidden="true"
                className="grid size-5 shrink-0 place-items-center rounded-full border border-foreground/40 peer-checked:border-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2"
              >
                <span className={`size-2.5 rounded-full bg-foreground transition-transform duration-200 ${checked ? "scale-100" : "scale-0"}`} />
              </span>
              <span className="flex-1 text-[17px] font-semibold tabular-nums">Up to {formatMoney(option.amount * 100, currency)}</span>
              <span className="text-[15px] text-muted-foreground tabular-nums">About {option.views.toLocaleString("en-US")} views</span>
            </label>
          )
        })}
      </div>
      <div className="flex flex-col gap-4 border-t border-border px-4 py-5">
        <p className="text-pretty text-[14px] text-muted-foreground">
          A view is one person seeing the ad on one day. Each person counts once a day, so the real number can be lower than the estimate.
        </p>
        {canAfford ? (
          <Button
            type="button"
            disabled={pending}
            onClick={send}
            className="h-12 w-full rounded-full text-[15px] font-semibold sm:w-fit sm:px-8"
          >
            {pending ? "Sending" : "Send for review"}
          </Button>
        ) : (
          <p className="text-[15px]">
            Your balance is too low for a boost.{" "}
            <Link href="/advertise" className="font-semibold underline underline-offset-4">
              Add funds
            </Link>{" "}
            first.
          </p>
        )}
        {error ? (
          <p role="alert" className="text-[15px] text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  )
}
