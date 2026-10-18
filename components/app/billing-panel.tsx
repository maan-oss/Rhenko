"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { toast } from "sonner"
import { openBilling, startPayouts, startSubscription, withdraw } from "@/actions/payments"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { LocalTime } from "@/components/app/time-text"
import { Button } from "@/components/ui/button"
import type { BillingState } from "@/lib/payments"
import { formatMoney } from "@/lib/money"

type Props = {
  state: BillingState
  plusPrice: string | null
  verifiedPrice: string | null
  notice: string | null
}

// The billing page's controls. Each one asks the server for a Stripe page and then sends the person there, so no card
// number is typed into this app. Money shown here comes from Stripe's own price.
export function BillingPanel({ state, plusPrice, verifiedPrice, notice }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const go = (action: () => Promise<{ ok: true; url: string } | { ok: false; error: string }>) =>
    startTransition(async () => {
      const result = await action()
      if (result.ok) window.location.assign(result.url)
      else toast.error(result.error)
    })

  const disabled = !state.configured || pending

  return (
    <>
      {notice ? (
        <p role="status" className="mx-4 mt-4 rounded-xl border border-border px-4 py-3 text-[15px]">
          {notice}
        </p>
      ) : null}
      {!state.configured ? (
        <p className="mx-4 mt-4 text-[15px] text-muted-foreground">Payments are not set up on this server yet. Nothing here can be bought until they are.</p>
      ) : null}

      <section className="flex flex-col gap-3 border-b border-border px-4 py-4" aria-labelledby="plus-heading">
        <h2 id="plus-heading" className="text-lg font-semibold">
          Rhenko Plus
        </h2>
        <p className="text-[15px] text-muted-foreground">
          No ads in your feeds. You can edit a post for a day instead of an hour. Plus does not change who sees your posts, how replies
          are ordered, or what search finds.
        </p>
        {state.plus.active ? (
          <p className="text-[15px]">
            {state.plus.cancelAtPeriodEnd ? "Plus ends " : "Plus renews "}
            {state.plus.periodEnd ? <LocalTime at={state.plus.periodEnd} variant="full" /> : "at the end of this period"}.
          </p>
        ) : (
          <p className="text-[15px]">{plusPrice ? `${plusPrice}, billed by Stripe. Cancel any time.` : "The price is not set up yet."}</p>
        )}
        <div className="flex flex-wrap gap-2">
          {state.plus.active ? (
            <Button type="button" variant="outline" disabled={disabled} onClick={() => go(openBilling)} className="h-10 rounded-full px-4 font-semibold">
              Manage billing
            </Button>
          ) : (
            <Button type="button" disabled={disabled || !plusPrice} onClick={() => go(() => startSubscription("plus"))} className="h-10 rounded-full px-4 font-semibold">
              Subscribe to Plus
            </Button>
          )}
          {state.plus.withdrawable ? (
            <ConfirmDialog
              trigger={
                <Button type="button" variant="outline" disabled={disabled} className="h-10 rounded-full px-4 font-semibold">
                  Withdraw
                </Button>
              }
              title="Withdraw from Plus?"
              description="Plus ends now, and the first payment is refunded to the card it was paid with. You can withdraw within 14 days of starting."
              confirmLabel="Withdraw and refund"
              action={() => withdraw("plus")}
              onDone={() => router.refresh()}
            />
          ) : null}
        </div>
      </section>

      <section className="flex flex-col gap-3 border-b border-border px-4 py-4" aria-labelledby="verified-heading">
        <h2 id="verified-heading" className="text-lg font-semibold">
          Paid subscriber badge
        </h2>
        <p className="text-[15px] text-muted-foreground">
          A ring beside your name that shows you pay for a subscription. It does not check who you are. Rhenko&apos;s verified badge is separate,
          and it is not sold.
        </p>
        {!state.emailVerified ? <p className="text-[15px]">Confirm your email address first. This badge needs one.</p> : null}
        {state.verified.active ? (
          <p className="text-[15px]">
            {state.verified.cancelAtPeriodEnd ? "The badge ends " : "The badge renews "}
            {state.verified.periodEnd ? <LocalTime at={state.verified.periodEnd} variant="full" /> : "at the end of this period"}.
          </p>
        ) : (
          <p className="text-[15px]">{verifiedPrice ? `${verifiedPrice}, billed by Stripe. Cancel any time.` : "The price is not set up yet."}</p>
        )}
        <div className="flex flex-wrap gap-2">
          {state.verified.active ? (
            <Button type="button" variant="outline" disabled={disabled} onClick={() => go(openBilling)} className="h-10 rounded-full px-4 font-semibold">
              Manage billing
            </Button>
          ) : (
            <Button
              type="button"
              disabled={disabled || !verifiedPrice || !state.emailVerified}
              onClick={() => go(() => startSubscription("verified"))}
              className="h-10 rounded-full px-4 font-semibold"
            >
              Get the subscriber badge
            </Button>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3 px-4 py-4" aria-labelledby="tips-heading">
        <h2 id="tips-heading" className="text-lg font-semibold">
          Tips and payouts
        </h2>
        <p className="text-[15px] text-muted-foreground">
          People can tip your posts. Rhenko keeps a share of each tip, which the tip dialog shows before anyone pays. The rest is paid to your bank through Stripe. Stripe asks
          for your identity and bank details. Rhenko does not keep them.
        </p>
        <p className="text-[15px]">
          {state.tips.count === 0
            ? "No tips received yet."
            : `${state.tips.count} ${state.tips.count === 1 ? "tip" : "tips"} received, ${formatMoney(state.tips.total ?? 0, state.tips.currency)} after Rhenko's share.`}
        </p>
        <p className="text-[15px]">
          {state.payouts.ready
            ? "Payouts are ready. Tips you receive are paid out by Stripe."
            : state.payouts.started
              ? "Payouts are not ready yet. Finish the Stripe steps to receive tips."
              : "Set up payouts to receive tips."}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={disabled || state.payouts.ready} onClick={() => go(startPayouts)} className="h-10 rounded-full px-4 font-semibold">
            {state.payouts.started ? "Continue payout setup" : "Set up payouts"}
          </Button>
        </div>
      </section>
    </>
  )
}
