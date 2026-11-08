"use client"

import { useEffect, useTransition } from "react"
import { useRouter } from "next/navigation"
import { motion, useReducedMotion } from "motion/react"
import { toast } from "sonner"
import { Ban, Clock, Sparkles, TrendingUp, Video, type LucideIcon } from "lucide-react"
import { openBilling, startSubscription, withdraw } from "@/actions/payments"
import { SubscriberBadge } from "@/components/app/badges"
import { Avatar } from "@/components/app/avatar"
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
  // The checkout result from Stripe's return address: "done", "cancelled", or nothing.
  checkout: string
}

// How long the page keeps checking for Stripe's confirmation after checkout, and how often it asks.
const CONFIRM_EVERY_MS = 3000
const CONFIRM_TRIES = 20

// Ease for everything that moves on this page: the same curve the app's sheets use.
const EASE = [0.22, 1, 0.36, 1] as const

// The screen for Rhenko Plus: what it is, what it changes, the price, and the buttons. Each button asks the server for a
// Stripe page and sends the person there, so no card number is typed into this app.
export function PlusScreen({ viewer, state, price, checkout }: Props) {
  const router = useRouter()
  const reduce = useReducedMotion()
  const [pending, startTransition] = useTransition()

  const active = state.plus.active
  // Stripe sends the person back before the webhook has marked Plus active. Check again until it has.
  const confirming = checkout === "done" && !active
  const subscribed = checkout === "done" && active

  useEffect(() => {
    if (!confirming) return
    let tries = 0
    const id = window.setInterval(() => {
      tries += 1
      router.refresh()
      if (tries >= CONFIRM_TRIES) window.clearInterval(id)
    }, CONFIRM_EVERY_MS)
    return () => window.clearInterval(id)
  }, [confirming, router])

  const go = (action: () => Promise<{ ok: true; url: string } | { ok: false; error: string }>) =>
    startTransition(async () => {
      const result = await action()
      if (result.ok) window.location.assign(result.url)
      else toast.error(result.error)
    })

  const busy = !state.configured || pending

  return (
    <div className="flex flex-col gap-10 px-4 pt-6 pb-10">
      {subscribed ? <Welcome renews={state.plus} reduce={reduce} /> : null}
      {confirming ? <Confirming /> : null}
      {checkout === "cancelled" ? (
        <p role="status" className="rounded-xl border border-border px-4 py-3 text-[15px]">
          No worries. You left checkout, and nothing was charged.
        </p>
      ) : null}

      {subscribed || confirming ? null : (
        <div className="flex flex-col gap-3">
          <h2 className="text-balance text-[30px] leading-[1.15] font-semibold tracking-[-0.02em]">Your posts reach more people.</h2>
          <p className="text-[16px] leading-6 text-muted-foreground">
            Plus boosts your posts in For you and takes the ads out of your home feed. Replies and search work the same for everyone.
          </p>
        </div>
      )}

      <Preview viewer={viewer} />

      <ul className="flex flex-col">
        {BENEFITS.map((benefit, index) => (
          <li key={benefit.title} className="reveal-in flex gap-4 border-b border-border py-5 first:pt-0" style={{ animationDelay: `${index * 50}ms` }}>
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-foreground" aria-hidden="true">
              {benefit.icon ? <benefit.icon className="size-5" strokeWidth={1.8} /> : <SubscriberBadge className="size-5" />}
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <h3 className="text-[16px] leading-6 font-semibold">{benefit.title}</h3>
              <p className="text-[15px] leading-6 text-muted-foreground">{benefit.detail}</p>
              {benefit.compare ? <Compare rows={benefit.compare} reduce={reduce} /> : null}
            </div>
          </li>
        ))}
      </ul>

      {active ? <Subscribed state={state} disabled={busy} onManage={() => go(openBilling)} /> : (
        <Offer state={state} price={price} busy={busy} onSubscribe={() => go(() => startSubscription("plus"))} />
      )}
    </div>
  )
}

type Benefit = {
  title: string
  detail: string
  // A plain icon. The subscriber mark has none, and draws its own.
  icon?: LucideIcon
  // Two numbers shown to scale, so the difference is plain without reading the detail.
  compare?: { label: string; value: string; share: number; strong?: boolean }[]
}

const BENEFITS: Benefit[] = [
  {
    icon: TrendingUp,
    title: "More people see your posts",
    detail: "Your posts get a boost in For you. It is the only place Plus changes who sees a post.",
  },
  {
    icon: Ban,
    title: "No ads in your home feed",
    detail: "The labelled ads are taken out of the home feed you scroll.",
  },
  {
    icon: Clock,
    title: "A day to edit a post",
    detail: "Fix a typo or a link for 24 hours after you post, instead of one hour.",
    compare: [
      { label: "Free", value: "1 hour", share: 4.2 },
      { label: "Plus", value: "24 hours", share: 100, strong: true },
    ],
  },
  {
    icon: Video,
    title: "Longer videos",
    detail: "Up to 10 minutes, instead of 2 minutes 20 seconds. The 100 MB limit is the same for everyone.",
    compare: [
      { label: "Free", value: "2:20", share: 23.3 },
      { label: "Plus", value: "10:00", share: 100, strong: true },
    ],
  },
  {
    icon: Sparkles,
    title: "An animated profile picture",
    detail: "Use a GIF as your picture, so it moves wherever your picture shows.",
  },
  {
    title: "A subscriber mark",
    detail: "A blue tick beside your name shows that you pay. Rhenko has not checked who you are.",
  },
]

// The person's own name and picture, with a sample post and the two things Plus adds to it. It is a preview, not a post.
function Preview({ viewer }: { viewer: Viewer }) {
  return (
    <section aria-labelledby="plus-preview" className="flex flex-col gap-3">
      <h3 id="plus-preview" className="text-[13px] font-medium tracking-[0.01em] text-muted-foreground">
        What a post looks like with Plus
      </h3>
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-start gap-3">
          <Avatar user={viewer} size={40} />
          <div className="flex min-w-0 flex-col">
            <p className="flex min-w-0 items-center gap-1 text-[15px] leading-5 font-semibold">
              <span className="truncate">{viewer.name}</span>
              <SubscriberBadge className="size-[1em] text-[14px]" />
            </p>
            <p className="truncate text-[14px] leading-5 text-muted-foreground">@{viewer.handle}</p>
          </div>
        </div>
        <p className="text-[16px] leading-6">Finally shipped the thing I have been working on for months.</p>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-border px-2.5 py-1 text-[13px]">Editable for 24 hours</span>
          <span className="rounded-full border border-border px-2.5 py-1 text-[13px]">Boosted in For you</span>
        </div>
      </div>
    </section>
  )
}

// Two bars drawn to the same scale, so the gap shows at a glance. They grow once when the screen opens.
function Compare({ rows, reduce }: { rows: NonNullable<Benefit["compare"]>; reduce: boolean | null }) {
  return (
    <div className="mt-2 flex flex-col gap-2" aria-hidden="true">
      {rows.map((row, index) => (
        <div key={row.label} className="flex items-center gap-3 text-[13px] leading-5">
          <span className="w-10 shrink-0 text-muted-foreground">{row.label}</span>
          <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-secondary">
            <motion.span
              className={row.strong ? "absolute inset-y-0 left-0 rounded-full bg-foreground" : "absolute inset-y-0 left-0 rounded-full bg-muted-foreground/60"}
              style={{ width: `${row.share}%`, originX: 0 }}
              initial={reduce ? false : { scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.6, delay: 0.25 + index * 0.12, ease: EASE }}
            />
          </span>
          <span className="w-20 shrink-0 text-right tabular-nums">{row.value}</span>
        </div>
      ))}
    </div>
  )
}

// The offer for someone who is not on Plus: the price, what happens when they pay, and the one button.
function Offer({ state, price, busy, onSubscribe }: { state: BillingState; price: string | null; busy: boolean; onSubscribe: () => void }) {
  const canBuy = state.configured && price !== null && state.emailVerified
  return (
    <section aria-labelledby="plus-offer" className="flex flex-col gap-4 border-t border-border pt-6">
      <h3 id="plus-offer" className="sr-only">
        Subscribe to Plus
      </h3>
      {!state.configured ? (
        <p className="text-[15px] text-muted-foreground">Plus can&apos;t be bought on this server yet. Nothing here will charge you.</p>
      ) : price === null ? (
        <p className="text-[15px] text-muted-foreground">Plus isn&apos;t ready to buy yet. Check back soon.</p>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="text-[22px] leading-7 font-semibold">{price}</p>
          <p className="text-[14px] leading-5 text-muted-foreground">Billed monthly by Stripe. Cancel any time.</p>
        </div>
      )}
      {state.configured && price !== null && !state.emailVerified ? (
        <p className="text-[15px]">Confirm your email address first, then you can start Plus.</p>
      ) : null}
      <Button
        type="button"
        disabled={busy || !canBuy}
        onClick={onSubscribe}
        className="h-12 w-full rounded-full text-[16px] font-semibold transition-transform duration-150 active:scale-[0.98]"
      >
        {!state.emailVerified ? "Confirm your email to subscribe" : pendingLabel(busy, price)}
      </Button>
      <p className="text-[13px] leading-5 text-muted-foreground">
        Renews each month until you cancel. Cancel any time in Settings, and Plus runs to the end of the month you have paid for. Changed
        your mind? Withdraw within 14 days of starting for a full refund. Read the{" "}
        <Link href="/terms" className="underline underline-offset-4 hover:text-foreground">
          terms
        </Link>{" "}
        and the{" "}
        <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground">
          privacy policy
        </Link>
        .
      </p>
      <div className="flex justify-center">
        <Link href="/settings" className="text-[15px] text-muted-foreground underline underline-offset-4 hover:text-foreground">
          Not now
        </Link>
      </div>
    </section>
  )
}

function pendingLabel(busy: boolean, price: string | null): string {
  if (busy) return "Opening checkout"
  return price ? `Subscribe for ${price}` : "Subscribe"
}

// The state for someone on Plus: when it renews or ends, and how to change it.
function Subscribed({ state, disabled, onManage }: { state: BillingState; disabled: boolean; onManage: () => void }) {
  const plus = state.plus
  return (
    <section aria-labelledby="plus-status" className="flex flex-col gap-4 border-t border-border pt-6">
      <div className="flex flex-col gap-1">
        <h3 id="plus-status" className="text-[20px] leading-7 font-semibold">
          You&apos;re on Plus
        </h3>
        <p className="text-[15px] leading-6 text-muted-foreground">
          {plus.cancelAtPeriodEnd ? "It ends " : "It renews "}
          {plus.periodEnd ? <LocalTime at={plus.periodEnd} variant="full" /> : "at the end of this period"}.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={disabled} onClick={onManage} className="h-11 rounded-full px-5 font-semibold">
          Manage billing
        </Button>
        {plus.withdrawable ? (
          <ConfirmDialog
            trigger={
              <Button type="button" variant="outline" disabled={disabled} className="h-11 rounded-full px-5 font-semibold">
                Withdraw
              </Button>
            }
            title="Withdraw from Plus?"
            description="Plus ends right away, and your first payment goes back to the card you paid with. You can do this within 14 days of starting."
            confirmLabel="Withdraw and refund"
            action={() => withdraw("plus")}
            onDone={() => toast.success("Plus is withdrawn. Your refund is on its way to the card you paid with.")}
          />
        ) : null}
      </div>
      {plus.withdrawable ? (
        <p className="text-[13px] leading-5 text-muted-foreground">
          Changed your mind? Withdraw within 14 days of starting and your first payment comes back. After that, cancel in Manage billing. Plus
          keeps running until the end of the period you paid for.
        </p>
      ) : null}
    </section>
  )
}

// The thank-you after a payment that Stripe has confirmed. The mark settles into place once, and nothing repeats.
function Welcome({ renews, reduce }: { renews: BillingState["plus"]; reduce: boolean | null }) {
  return (
    <section aria-labelledby="plus-welcome" role="status" className="flex flex-col items-start gap-4 pt-2">
      <motion.span
        aria-hidden="true"
        className="grid size-16 place-items-center rounded-full bg-secondary"
        initial={reduce ? false : { scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={reduce ? { duration: 0 } : SPRING_POP}
      >
        <SubscriberBadge className="size-9" />
      </motion.span>
      <div className="flex flex-col gap-2">
        <h2 id="plus-welcome" className="text-balance text-[28px] leading-[1.15] font-semibold tracking-[-0.02em]">
          You&apos;re on Plus.
        </h2>
        <p className="text-[16px] leading-6 text-muted-foreground">
          Thanks for supporting Rhenko. Your perks are on, and a receipt is on its way to your email.
          {renews.periodEnd ? (
            <>
              {" "}
              It renews <LocalTime at={renews.periodEnd} variant="full" />.
            </>
          ) : null}
        </p>
      </div>
    </section>
  )
}

// Shown while Stripe's confirmation is on its way. The page checks again on its own.
function Confirming() {
  return (
    <section aria-labelledby="plus-confirming" role="status" className="flex items-start gap-3 pt-2">
      <span aria-hidden="true" className="mt-1 size-5 shrink-0 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground motion-reduce:animate-none" />
      <div className="flex flex-col gap-1">
        <h2 id="plus-confirming" className="text-[20px] leading-7 font-semibold">
          Confirming your payment
        </h2>
        <p className="text-[15px] leading-6 text-muted-foreground">
          Stripe usually confirms within a minute. This page checks again for you, and Plus appears here as soon as it is confirmed.
        </p>
      </div>
    </section>
  )
}
