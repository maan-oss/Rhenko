"use client"

import { useEffect, useTransition } from "react"
import { useRouter } from "next/navigation"
import { motion, useReducedMotion } from "motion/react"
import { toast } from "sonner"
import { Ban, Clock, Heart, MessageCircle, Repeat2, Sparkles, TrendingUp, Video, type LucideIcon } from "lucide-react"
import { openBilling, startSubscription, withdraw } from "@/actions/payments"
import { Avatar } from "@/components/app/avatar"
import { SubscriberBadge } from "@/components/app/badges"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import Link from "@/components/app/link"
import { SPRING_POP } from "@/components/app/motion"
import { LocalTime } from "@/components/app/time-text"
import { Button } from "@/components/ui/button"
import type { Viewer } from "@/lib/auth"
import type { BillingState } from "@/lib/payments"

type Props = {
  viewer: Viewer
  state: BillingState
  price: string | null
  // Stripe's return result: "done" after a payment, or nothing.
  checkout: string
}

// Stripe sends the person back a moment before the payment is confirmed. The page asks again a few times, quietly, so the
// subscription appears on its own. It never asks more than this.
const RECHECK_AFTER_MS = [2000, 6000, 12000]

// Rhenko Plus. It shows a post as it looks with Plus, what Plus adds, and one button. The post is built the way the feed
// builds one, so the mark sits beside the name exactly as it does everywhere else.
export function PlusScreen({ viewer, state, price, checkout }: Props) {
  const router = useRouter()
  const reduce = useReducedMotion()
  const [pending, startTransition] = useTransition()

  const active = state.plus.active
  const justPaid = checkout === "done"
  // Paid, but Stripe has not confirmed it yet. Buying again now would be a second charge, so the button waits.
  const awaiting = justPaid && !active

  useEffect(() => {
    if (!awaiting) return
    const timers = RECHECK_AFTER_MS.map((ms) => window.setTimeout(() => router.refresh(), ms))
    return () => timers.forEach((id) => window.clearTimeout(id))
  }, [awaiting, router])

  const go = (action: () => Promise<{ ok: true; url: string } | { ok: false; error: string }>) =>
    startTransition(async () => {
      const result = await action()
      if (result.ok) window.location.assign(result.url)
      else toast.error(result.error)
    })

  const canBuy = state.configured && price !== null && state.emailVerified && !pending && !awaiting

  return (
    <div className="flex flex-col px-4 pt-6 pb-10">
      <header className="flex flex-col gap-1">
        <h2 className="text-3xl font-semibold tracking-tight">{active ? "You're on Plus" : "More reach for your posts"}</h2>
        <p className="text-[15px] text-muted-foreground">
          {active ? <Status state={state} /> : <Price state={state} price={price} />}
        </p>
      </header>

      <section aria-label="Preview" className="mt-8">
        <article className="flex gap-3 border-y border-border py-3">
          <Avatar user={viewer} size={40} className="shrink-0" />
          <div className="min-w-0 flex-1">
            <header className="flex min-w-0 items-baseline gap-x-2 leading-tight">
              <span className="inline-flex min-w-0 items-center font-semibold">
                <span className="truncate">{viewer.name}</span>
                <motion.span
                  className="ml-1 inline-flex shrink-0"
                  initial={justPaid && active && !reduce ? { scale: 0.5 } : false}
                  animate={{ scale: 1 }}
                  transition={SPRING_POP}
                >
                  <SubscriberBadge />
                </motion.span>
              </span>
              <span className="min-w-0 truncate text-[15px] text-muted-foreground">@{viewer.handle}</span>
            </header>
            <p className="mt-0.5 text-[15px] leading-relaxed">Finally shipped the thing I have been working on.</p>
            <div className="mt-3 flex gap-8 text-muted-foreground" aria-hidden="true">
              <MessageCircle className="size-[18px]" strokeWidth={1.8} />
              <Repeat2 className="size-[18px]" strokeWidth={1.8} />
              <Heart className="size-[18px]" strokeWidth={1.8} />
            </div>
          </div>
        </article>
      </section>

      <ul className="mt-2 flex flex-col">
        {BENEFITS.map((benefit, index) => (
          <li
            key={benefit.title}
            className="reveal-in flex items-start gap-4 border-b border-border py-4 last:border-b-0"
            style={{ animationDelay: `${index * 40}ms` }}
          >
            <benefit.icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" strokeWidth={1.8} aria-hidden="true" />
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="text-[15px] font-medium">{benefit.title}</p>
              {benefit.detail ? <p className="text-[14px] leading-5 text-muted-foreground">{benefit.detail}</p> : null}
            </div>
          </li>
        ))}
      </ul>

      <section className="mt-6 flex flex-col gap-3">
        {active ? (
          <>
            <Button
              type="button"
              variant="outline"
              disabled={!state.configured || pending}
              onClick={() => go(openBilling)}
              className="h-12 w-full rounded-full text-[16px] font-semibold"
            >
              Manage billing
            </Button>
            {state.plus.withdrawable ? (
              <div className="flex justify-center">
                <ConfirmDialog
                  trigger={
                    <Button type="button" variant="ghost" disabled={!state.configured || pending} className="h-10 rounded-full px-4 text-[15px] text-muted-foreground">
                      Withdraw
                    </Button>
                  }
                  title="Withdraw from Plus?"
                  description="Plus ends right away, and your first payment goes back to the card you paid with. You can do this within 14 days of starting."
                  confirmLabel="Withdraw and refund"
                  action={() => withdraw("plus")}
                  onDone={() => toast.success("Plus is withdrawn. Your refund is on its way.")}
                />
              </div>
            ) : null}
          </>
        ) : (
          <>
            <Button
              type="button"
              disabled={!canBuy}
              onClick={() => go(() => startSubscription("plus"))}
              className="h-12 w-full rounded-full text-[16px] font-semibold transition-transform duration-150 active:scale-[0.98]"
            >
              {buttonLabel(state, price, pending)}
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
          </>
        )}
      </section>
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
  return <>{price}, billed monthly.</>
}

function Status({ state }: { state: BillingState }) {
  const plus = state.plus
  if (!plus.periodEnd) return <>Thanks for supporting Rhenko.</>
  return (
    <>
      {plus.cancelAtPeriodEnd ? "Ends " : "Renews "}
      <LocalTime at={plus.periodEnd} variant="full" />
    </>
  )
}

// The button says what it does: confirm the email, open checkout, or subscribe for the price.
function buttonLabel(state: BillingState, price: string | null, pending: boolean): string {
  if (!state.emailVerified) return "Confirm your email to subscribe"
  if (pending) return "Opening checkout"
  return price ? `Subscribe for ${price}` : "Subscribe"
}
