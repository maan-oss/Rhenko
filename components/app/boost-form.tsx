"use client"

import Link from "@/components/app/link"
import { useState, useTransition } from "react"
import { Check } from "lucide-react"
import { boostPost } from "@/actions/ads"
import { Button } from "@/components/ui/button"
import type { BoostOption } from "@/lib/boost-setup"
import { formatMoney } from "@/lib/money"

// Pick the most a boost may spend, then send it for review. Each row shows about how many views it buys. The second row is
// chosen to start. Nothing runs until a person approves the boost.
export function BoostForm({
  postId,
  options,
  currency,
  balance,
}: {
  postId: string
  options: BoostOption[]
  currency: string
  // In minor units (cents), as formatMoney takes it.
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
      <section aria-live="polite" className="flex flex-col items-center gap-2 px-6 pt-4 pb-6 text-center">
        <p className="text-[17px] font-semibold">Sent for review</p>
        <p className="text-pretty text-[15px] text-muted-foreground">A person checks it before it runs. While it runs, it is labelled Ad.</p>
        <Link
          href={`/advertise/campaigns/${sent}`}
          className="mt-3 inline-flex h-12 items-center rounded-full border border-border px-6 text-[15px] font-semibold transition-colors duration-200 hover:bg-muted"
        >
          See this boost
        </Link>
      </section>
    )
  }

  return (
    <div className="flex flex-col gap-4 px-4 pb-4">
      <div role="radiogroup" aria-label="Budget" className="flex flex-col gap-1.5">
        {options.map((option) => {
          const checked = option.amount === selected
          return (
            <label
              key={option.amount}
              className="flex min-h-16 cursor-pointer items-center justify-between gap-4 rounded-2xl px-4 py-2.5 transition-colors duration-200 hover:bg-muted has-[:checked]:bg-muted has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
            >
              <input
                type="radio"
                name="boost-budget"
                value={option.amount}
                checked={checked}
                disabled={pending}
                onChange={() => setSelected(option.amount)}
                className="sr-only"
              />
              <span className="flex min-w-0 flex-col">
                <span className="text-[16px] font-semibold tabular-nums">Up to {formatMoney(option.amount * 100, currency)}</span>
                <span className="text-[14px] text-muted-foreground tabular-nums">About {option.views.toLocaleString("en-US")} views</span>
              </span>
              <Check
                aria-hidden="true"
                strokeWidth={2.4}
                className={`size-5 shrink-0 transition-[opacity,transform] duration-200 ${checked ? "scale-100 opacity-100" : "scale-75 opacity-0"}`}
              />
            </label>
          )
        })}
      </div>

      <p className="text-center text-[13px] text-muted-foreground text-pretty">
        Balance {formatMoney(balance, currency)}. A view is one person seeing the ad on one day, so the real number can be lower.
      </p>

      {canAfford ? (
        <Button type="button" disabled={pending} onClick={send} className="h-14 w-full rounded-full text-[16px] font-semibold max-sm:h-14">
          {pending ? "Sending" : "Send for review"}
        </Button>
      ) : (
        <p className="text-center text-[15px]">
          Your balance is too low for a boost.{" "}
          <Link href="/advertise" className="font-semibold underline underline-offset-4">
            Add funds
          </Link>{" "}
          first.
        </p>
      )}
      {error ? (
        <p role="alert" className="text-center text-[15px] text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
