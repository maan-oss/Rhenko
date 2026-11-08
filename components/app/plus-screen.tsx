"use client"

import { useEffect, useTransition } from "react"
import { useRouter } from "next/navigation"
import { motion, useReducedMotion } from "motion/react"
import { toast } from "sonner"
import { Ban, Clock, Sparkles, TrendingUp, Video, type LucideIcon } from "lucide-react"
import { openBilling, startSubscription, withdraw } from "@/actions/payments"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import Link from "@/components/app/link"
import { SPRING_SHEET } from "@/components/app/motion"
import { LocalTime } from "@/components/app/time-text"
import { Button } from "@/components/ui/button"
import type { BillingState } from "@/lib/payments"

type Props = {
  state: BillingState
  price: string | null
  // Set by Stripe's return: "done" after a payment, "cancelled" if the person left the checkout.
  checkout: string
}

type Started = { ok: true; url: string } | { ok: false; error: string }

// A payment Stripe has started but not confirmed. The page asks again a few times, quietly, so Plus appears on its own.
const RECHECK_AFTER_MS = [3000, 8000, 15000]

// Rhenko Plus. A title, what Plus changes, and one action. Nothing else competes with it.
export function PlusScreen({ state, price, checkout }: Props) {
  const router = useRouter()
  const reduce = useReducedMotion()
  const [busy, startTransition] = useTransition()

  const active = state.plus.active
  // Paid, but not confirmed yet. There is no button while this is true, so a second payment cannot start.
  const settling = !active && state.plus.pending
  // Arriving from a payment: the heading settles in once.
  const justPaid = active && checkout === "done"

  useEffect(() => {
    if (!settling) return
    const timers = RECHECK_AFTER_MS.map((ms) => window.setTimeout(() => router.refresh(), ms))
    return () => timers.forEach((id) => window.clearTimeout(id))
  }, [settling, router])

  const go = (action: () => Promise<Started>) =>
    startTransition(async () => {
      const result = await action()
      if (result.ok) window.location.assign(result.url)
      else toast.error(result.error)
    })

  const canBuy = state.configured && price !== null && state.emailVerified && !busy

  return (
    <div className="flex flex-col px-4 pt-5 pb-32 lg:pb-10">
      <motion.header
        className="flex flex-col gap-1"
        initial={justPaid && !reduce ? { opacity: 0, y: 8 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={SPRING_SHEET}
      >
        <h2 className="text-3xl font-semibold tracking-tight">{active ? "You're on Plus" : "More reach for your posts"}</h2>
        <p className="text-[15px] text-muted-foreground">
          {active ? <Status state={state} /> : settling ? "Your payment is still going through. This page updates on its own." : <Price state={state} price={price} />}
        </p>
      </motion.header>

      <ul className="mt-5 flex flex-col">
        {BENEFITS.map((benefit, index) => (
          <li
            key={benefit.title}
            className="reveal-in flex items-start gap-3.5 border-b border-border py-3.5 last:border-b-0"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <benefit.icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" strokeWidth={1.8} aria-hidden="true" />
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="text-[15px] font-medium">{benefit.title}</p>
              {benefit.detail ? <p className="text-[14px] leading-5 text-muted-foreground">{benefit.detail}</p> : null}
            </div>
          </li>
        ))}
      </ul>

      {active ? (
        <section className="mt-5 flex flex-col gap-1">
          <Button
            type="button"
            disabled={!state.configured || busy}
            onClick={() => go(openBilling)}
            className="h-12 w-full rounded-full text-[16px] font-semibold"
          >
            {busy ? "Opening billing" : "Manage billing"}
          </Button>
          {state.plus.withdrawable ? (
            <div className="flex justify-center">
              <ConfirmDialog
                trigger={
                  <Button type="button" variant="ghost" disabled={!state.configured || busy} className="h-10 rounded-full px-4 text-[15px] text-muted-foreground">
                    Withdraw
                  </Button>
                }
                title="Withdraw from Plus?"
                description="Plus ends right away, and your first payment goes back to the card you paid with. You can do this within 14 days of starting."
                confirmLabel="Withdraw and refund"
                action={() => withdraw("plus")}
                onDone={() => {
                  toast.success("Plus is withdrawn. Your refund is on its way.")
                  router.refresh()
                }}
              />
            </div>
          ) : null}
        </section>
      ) : settling ? null : (
        <section className="mt-5 flex flex-col gap-2">
          <Button
            type="button"
            disabled={!canBuy}
            onClick={() => go(() => startSubscription("plus"))}
            className="h-12 w-full rounded-full text-[16px] font-semibold transition-transform duration-150 active:scale-[0.98]"
          >
            {buttonLabel(state, price, busy)}
          </Button>
          <p className="text-center text-[13px] leading-5 text-muted-foreground">
            Renews monthly until you cancel. Withdraw within 14 days for a full refund.
          </p>
          <p className="text-center text-[13px] text-muted-foreground">
            <Link href="/terms" className="underline underline-offset-4 hover:text-foreground">
              Terms
            </Link>
            {" · "}
            <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground">
              Privacy
            </Link>
          </p>
        </section>
      )}
    </div>
  )
}

type Benefit = { icon: LucideIcon; title: string; detail?: string }

const BENEFITS: Benefit[] = [
  { icon: TrendingUp, title: "More people see your posts", detail: "Plus boosts them in For you. Replies and search stay the same." },
  { icon: Ban, title: "No ads in your home feed" },
  { icon: Clock, title: "24 hours to edit a post" },
  { icon: Video, title: "Videos up to 10 minutes" },
  { icon: Sparkles, title: "An animated profile picture" },
]

function Price({ state, price }: { state: BillingState; price: string | null }) {
  if (!state.configured) return <>Payments aren&apos;t set up on this server yet.</>
  if (price === null) return <>Plus isn&apos;t ready to buy yet.</>
  return <>{price}. Cancel any time.</>
}

function Status({ state }: { state: BillingState }) {
  const plus = state.plus
  if (plus.periodEnd === null) return <>Thanks for supporting Rhenko.</>
  return (
    <>
      {plus.cancelAtPeriodEnd ? "Ends " : "Renews "}
      <LocalTime at={plus.periodEnd} variant="full" />
    </>
  )
}

// The button says what it does: confirm the email, open checkout, or subscribe for the price.
function buttonLabel(state: BillingState, price: string | null, busy: boolean): string {
  if (!state.emailVerified) return "Confirm your email to subscribe"
  if (busy) return "Opening checkout"
  return price ? `Subscribe for ${price}` : "Subscribe"
}
