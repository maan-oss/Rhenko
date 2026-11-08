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
  notice: string | null
}

// What Rhenko Plus includes, in the order the page lists it. Each line is true of the code: see the rules and upload checks.
const PLUS_INCLUDES = [
  "No ads in your home feed.",
  "Edit a post for a day, instead of an hour.",
  "The paid subscriber ring beside your name. It shows that you pay. It does not check who you are.",
  "An animated profile picture, which can be a GIF.",
  "Videos up to 10 minutes long, instead of 2 minutes 20 seconds. The 100 MB size limit is the same for everyone.",
]

// The billing page's controls. Each one asks the server for a Stripe page and then sends the person there, so no card
// number is typed into this app. Money shown here comes from Stripe's own price.
export function BillingPanel({ state, plusPrice, notice }: Props) {
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
        {state.plus.active ? (
          <p className="text-[15px]">
            {state.plus.cancelAtPeriodEnd ? "You're still on Plus. It ends " : "You're on Plus. It renews "}
            {state.plus.periodEnd ? <LocalTime at={state.plus.periodEnd} variant="full" /> : "at the end of this period"}.
          </p>
        ) : (
          <p className="text-[15px]">{plusPrice ? `${plusPrice}, billed securely by Stripe. Cancel any time.` : "Plus isn't ready to buy yet. Check back soon."}</p>
        )}
        <div className="flex flex-col gap-2">
          <p className="text-[15px] font-semibold">Plus includes</p>
          <ul className="list-disc space-y-2 pl-5 text-[15px]">
            {PLUS_INCLUDES.map((line, index) => (
              <li key={line} className="reveal-in" style={{ animationDelay: `${index * 50}ms` }}>
                {line}
              </li>
            ))}
          </ul>
          <p className="text-[15px] text-muted-foreground">Plus does not change who sees your posts, how replies are ordered, or what search finds.</p>
        </div>
        {!state.plus.active && !state.emailVerified ? <p className="text-[15px]">Confirm your email address first, then you can start Plus.</p> : null}
        <div className="flex flex-wrap gap-2">
          {state.plus.active ? (
            <Button type="button" variant="outline" disabled={disabled} onClick={() => go(openBilling)} className="h-10 rounded-full px-4 font-semibold">
              Manage billing
            </Button>
          ) : (
            <Button
              type="button"
              disabled={disabled || !plusPrice || !state.emailVerified}
              onClick={() => go(() => startSubscription("plus"))}
              className="h-10 rounded-full px-4 font-semibold transition-transform duration-150 active:scale-[0.97]"
            >
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
              description="Plus ends right away, and your first payment goes back to the card you paid with. You can do this within 14 days of starting."
              confirmLabel="Withdraw and refund"
              action={() => withdraw("plus")}
              onDone={() => {
                toast.success("Plus is withdrawn. Your refund is on its way to the card you paid with.")
                router.refresh()
              }}
            />
          ) : null}
        </div>
        {state.plus.withdrawable ? (
          <p className="text-sm text-muted-foreground">Changed your mind? Withdraw within 14 days of starting and your first payment comes back. After that, use Manage billing to cancel. Plus keeps running until the end of the period you paid for.</p>
        ) : null}
      </section>

      {state.verified.active ? (
        <section className="flex flex-col gap-3 border-b border-border px-4 py-4" aria-labelledby="badge-heading">
          <h2 id="badge-heading" className="text-lg font-semibold">
            Your older subscriber badge
          </h2>
          <p className="text-[15px] text-muted-foreground">
            You bought the paid subscriber ring before Rhenko Plus included it. Plus has the ring too, so you can keep this one or cancel it
            here. The ring shows that you pay. It doesn&apos;t check who you are.
          </p>
          <p className="text-[15px]">
            {state.verified.cancelAtPeriodEnd ? "The badge ends " : "The badge renews "}
            {state.verified.periodEnd ? <LocalTime at={state.verified.periodEnd} variant="full" /> : "at the end of this period"}.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={disabled} onClick={() => go(openBilling)} className="h-10 rounded-full px-4 font-semibold">
              Manage billing
            </Button>
            {state.verified.withdrawable ? (
              <ConfirmDialog
                trigger={
                  <Button type="button" variant="outline" disabled={disabled} className="h-10 rounded-full px-4 font-semibold">
                    Withdraw
                  </Button>
                }
                title="Withdraw from the subscriber badge?"
                description="The badge ends now, and the first payment is refunded to the card it was paid with. You can withdraw within 14 days of starting."
                confirmLabel="Withdraw and refund"
                action={() => withdraw("verified")}
                onDone={() => router.refresh()}
              />
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-3 px-4 py-4" aria-labelledby="tips-heading">
        <h2 id="tips-heading" className="text-lg font-semibold">
          Tips and payouts
        </h2>
        <p className="text-[15px] text-muted-foreground">
          People can tip your posts. Rhenko keeps a small share of each tip, and the tip window shows that before anyone pays. The rest goes to
          your bank through Stripe. Stripe handles your identity and bank details, so Rhenko never sees them.
        </p>
        <p className="text-[15px]">
          {state.tips.count === 0
            ? "No tips yet. When someone tips one of your posts, it shows up here."
            : `You've had ${state.tips.count} ${state.tips.count === 1 ? "tip" : "tips"}, worth ${formatMoney(state.tips.total ?? 0, state.tips.currency)} to you after Rhenko's share.`}
        </p>
        <p className="text-[15px]">
          {state.payouts.ready
            ? "You're all set. Tips go straight to your bank through Stripe."
            : state.payouts.started
              ? "Almost there. Finish the Stripe steps to start receiving tips."
              : "Set up payouts so you can receive tips."}
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
