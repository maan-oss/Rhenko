"use client"

import Link from "@/components/app/link"
import { useEffect, useRef, useState, useTransition, type KeyboardEvent } from "react"
import { ChevronRight } from "lucide-react"
import { boostPost } from "@/actions/ads"
import { Button } from "@/components/ui/button"
import type { BoostOption } from "@/lib/boost-setup"
import { formatMoney } from "@/lib/money"

// The budget wheel is five rows high, with the chosen row in the middle. Scrolling it, tapping a row or using the arrow keys
// chooses a budget.
const ROW = 56
const VISIBLE = 5
const MIDDLE = Math.floor(VISIBLE / 2)
// How long the wheel must stand still before the row under the middle counts as chosen.
const SETTLE_MS = 120
// The rows at the top and bottom of the wheel fade, so the chosen row reads first.
const FADE = "linear-gradient(to bottom, rgba(0,0,0,0.15), #000 36%, #000 64%, rgba(0,0,0,0.15))"

function BudgetWheel({
  options,
  selected,
  currency,
  onSelect,
}: {
  options: BoostOption[]
  selected: number
  currency: string
  onSelect: (amount: number) => void
}) {
  const list = useRef<HTMLDivElement>(null)
  const settle = useRef<number | undefined>(undefined)
  const moved = useRef(false)
  const index = Math.max(0, options.findIndex((option) => option.amount === selected))
  const last = options.length - 1

  // Bring the wheel to the chosen row when the choice came from a tap, the keyboard or the start. A wheel already on that row is
  // left alone, so a scroll the person is making is not fought.
  useEffect(() => {
    const el = list.current
    if (!el) return
    const target = index * ROW
    if (Math.abs(el.scrollTop - target) < 1) return
    const instant = !moved.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches
    moved.current = true
    el.scrollTo({ top: target, behavior: instant ? "auto" : "smooth" })
  }, [index])

  useEffect(() => () => window.clearTimeout(settle.current), [])

  // Once the wheel stops, the row now under the middle is the choice.
  function onScroll() {
    window.clearTimeout(settle.current)
    settle.current = window.setTimeout(() => {
      const el = list.current
      if (!el) return
      const next = Math.min(last, Math.max(0, Math.round(el.scrollTop / ROW)))
      const option = options[next]
      if (option && option.amount !== selected) onSelect(option.amount)
    }, SETTLE_MS)
  }

  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    const next =
      event.key === "ArrowDown" ? Math.min(index + 1, last)
      : event.key === "ArrowUp" ? Math.max(index - 1, 0)
      : event.key === "Home" ? 0
      : event.key === "End" ? last
      : -1
    if (next < 0) return
    event.preventDefault()
    const option = options[next]
    if (option) onSelect(option.amount)
  }

  return (
    <div className="relative" style={{ height: ROW * VISIBLE }}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 rounded-2xl bg-muted" style={{ top: ROW * MIDDLE, height: ROW }} />
      <div
        ref={list}
        role="listbox"
        aria-label="Budget"
        tabIndex={0}
        onScroll={onScroll}
        onKeyDown={onKey}
        className="relative h-full snap-y snap-mandatory overflow-y-auto overscroll-contain rounded-2xl outline-none [scrollbar-width:none] focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-scrollbar]:hidden"
        style={{ paddingTop: ROW * MIDDLE, paddingBottom: ROW * MIDDLE, maskImage: FADE, WebkitMaskImage: FADE }}
      >
        {options.map((option, i) => (
          <div
            key={option.amount}
            role="option"
            aria-selected={i === index}
            onClick={() => onSelect(option.amount)}
            className="flex snap-center cursor-pointer items-center justify-between gap-4 px-4"
            style={{ height: ROW }}
          >
            <span className="min-w-0 truncate text-[15px] text-muted-foreground tabular-nums">About {option.views.toLocaleString("en-US")} views</span>
            <span className="shrink-0 text-[17px] font-semibold tabular-nums">{formatMoney(option.amount * 100, currency)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Choose how much the boost may spend, then send it for review. Nothing runs until a person approves it.
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

  function choose(amount: number) {
    if (!pending) setSelected(amount)
  }

  const send = () =>
    startTransition(async () => {
      setError(null)
      const result = await boostPost(postId, selected)
      if (result.ok) setSent(result.campaignId)
      else setError(result.error)
    })

  if (sent) {
    return (
      <section aria-live="polite" className="flex flex-col items-center gap-2 px-6 pt-6 pb-8 text-center">
        <p className="text-[17px] font-semibold">Sent for review</p>
        <p className="text-pretty text-[15px] text-muted-foreground">A person checks it before it runs. While it runs, it is labelled Ad.</p>
        <Link
          href={`/advertise/campaigns/${sent}`}
          className="mt-4 inline-flex h-12 items-center rounded-full border border-border px-6 text-[15px] font-semibold transition-colors duration-200 hover:bg-muted"
        >
          See this boost
        </Link>
      </section>
    )
  }

  return (
    <div className="flex flex-col gap-4 px-4 pt-2 pb-4">
      <BudgetWheel options={options} selected={selected} currency={currency} onSelect={choose} />

      <div className="flex flex-col gap-2">
        <Link
          href="/advertise"
          className="flex h-14 items-center justify-between rounded-2xl bg-muted px-4 text-[15px] transition-colors duration-200 hover:bg-foreground/[0.08]"
        >
          <span className="text-muted-foreground">Pay with</span>
          <span className="flex items-center gap-1 font-semibold">
            {canAfford ? `Balance ${formatMoney(balance, currency)}` : "Add funds"}
            <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
          </span>
        </Link>
        <div className="flex h-14 items-center justify-between rounded-2xl bg-muted px-4 text-[15px]">
          <span className="text-muted-foreground">Starts</span>
          <span className="font-semibold">After review</span>
        </div>
      </div>

      <p className="px-2 text-center text-[12px] leading-relaxed text-pretty text-muted-foreground">
        A person checks each boost before it runs. Views are estimates, so the real number can be lower.{" "}
        <Link href="/transparency/ads" className="underline underline-offset-4 hover:text-foreground">
          How boosts work
        </Link>
      </p>

      {canAfford ? (
        <Button
          type="button"
          disabled={pending}
          onClick={send}
          className="h-14 w-full rounded-full bg-foreground text-[16px] font-semibold text-background hover:bg-foreground/90 max-sm:h-14"
        >
          {pending ? "Sending" : "Boost post"}
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
