"use client"

import { useOptimistic, useSyncExternalStore, useTransition } from "react"
import { motion } from "motion/react"
import { Check } from "lucide-react"
import { toast } from "sonner"
import { votePoll } from "@/actions/posts"
import type { PollView as PollData } from "@/lib/data"
import { cn } from "@/lib/utils"

// Re-renders every 30 seconds so the time left stays roughly right. The timer only runs while a poll is on screen, and
// the clock is read from one value that changes only on a tick, so the store's snapshot stays the same between renders.
const tickers = new Set<() => void>()
let timerId: number | undefined
let clockNow = 0
function subscribeToClock(onChange: () => void) {
  tickers.add(onChange)
  clockNow = Date.now()
  if (timerId === undefined) {
    timerId = window.setInterval(() => {
      clockNow = Date.now()
      tickers.forEach((notify) => notify())
    }, 30_000)
  }
  return () => {
    tickers.delete(onChange)
    if (tickers.size === 0 && timerId !== undefined) {
      window.clearInterval(timerId)
      timerId = undefined
    }
  }
}
function readClock() {
  return clockNow
}

function timeLeft(endsAt: number, now: number): string {
  const ms = endsAt - now
  if (ms <= 0) return "Final results"
  const minutes = Math.ceil(ms / 60000)
  if (minutes < 60) return `${minutes} min left`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} left`
  const days = Math.round(hours / 24)
  return `${days} ${days === 1 ? "day" : "days"} left`
}

export function PollView({ postId, poll }: { postId: string; poll: PollData }) {
  const now = useSyncExternalStore(subscribeToClock, readClock, () => 0)
  const ended = now > 0 && poll.endsAt <= now
  const [myVote, setMyVote] = useOptimistic(poll.myOptionId)
  const [pending, startTransition] = useTransition()
  const showResults = myVote !== null || ended
  const total = poll.total + (myVote !== null && poll.myOptionId === null ? 1 : 0)
  // Votes as the viewer sees them, with their own vote counted. The leader is only marked once the results are showing.
  const counts = poll.options.map((option) => option.votes + (myVote === option.id && poll.myOptionId === null ? 1 : 0))
  const top = Math.max(0, ...counts)

  function vote(optionId: string) {
    if (showResults || pending) return
    startTransition(async () => {
      setMyVote(optionId)
      const result = await votePoll(postId, optionId)
      if (!result.ok) toast.error(result.error)
    })
  }

  return (
    <div className="mt-3 flex flex-col gap-2" role="group" aria-label={showResults ? "Poll results" : "Poll. Choose one option."}>
      {poll.options.map((option, index) => {
        const votes = counts[index]
        const percent = total > 0 ? Math.round((votes / total) * 100) : 0
        const chosen = myVote === option.id
        const leading = showResults && top > 0 && votes === top
        if (!showResults) {
          return (
            <button
              key={option.id}
              type="button"
              disabled={pending}
              onClick={() => vote(option.id)}
              className="relative z-10 h-11 rounded-xl border border-border px-4 text-left text-[15px] font-medium transition-colors hover:border-foreground/40 hover:bg-foreground/5"
            >
              {option.label}
            </button>
          )
        }
        return (
          <div key={option.id} className="relative z-10 overflow-hidden rounded-xl border border-border">
            <motion.div
              className={cn("absolute inset-y-0 left-0", chosen ? "bg-foreground/15" : "bg-muted")}
              initial={{ width: 0 }}
              animate={{ width: `${percent}%` }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            />
            <div className="relative flex h-11 items-center justify-between gap-3 px-4 text-[15px]">
              <span className={cn("flex min-w-0 items-center gap-2", (chosen || leading) && "font-semibold")}>
                <span className="truncate">{option.label}</span>
                {chosen ? <Check className="size-4 shrink-0" strokeWidth={2.4} aria-hidden="true" /> : null}
                {chosen ? <span className="sr-only">(your vote)</span> : null}
              </span>
              <span className={cn("shrink-0 tabular-nums", leading ? "font-bold" : "font-semibold")}>{percent}%</span>
            </div>
          </div>
        )
      })}
      <p className="text-[13px] text-muted-foreground">
        {total.toLocaleString("en-US")} {total === 1 ? "vote" : "votes"}
        {now > 0 ? (
          <>
            {" · "}
            <time dateTime={new Date(poll.endsAt).toISOString()} title={`Ends ${new Date(poll.endsAt).toLocaleString()}`}>
              {timeLeft(poll.endsAt, now)}
            </time>
          </>
        ) : null}
      </p>
    </div>
  )
}
