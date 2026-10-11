"use client"

import { useOptimistic, useSyncExternalStore, useTransition } from "react"
import { motion } from "motion/react"
import { toast } from "sonner"
import { votePoll } from "@/actions/posts"
import type { PollView as PollData } from "@/lib/data"
import { cn } from "@/lib/utils"

// Re-renders every 30 seconds so the time left stays roughly right. The timer
// only runs while a poll is on screen, and never during server rendering.
const tickers = new Set<() => void>()
let timerId: number | undefined
function subscribeToClock(onChange: () => void) {
  tickers.add(onChange)
  if (timerId === undefined) {
    timerId = window.setInterval(() => tickers.forEach((notify) => notify()), 30_000)
  }
  return () => {
    tickers.delete(onChange)
    if (tickers.size === 0 && timerId !== undefined) {
      window.clearInterval(timerId)
      timerId = undefined
    }
  }
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
  const now = useSyncExternalStore(subscribeToClock, () => Date.now(), () => 0)
  const ended = now > 0 && poll.endsAt <= now
  const [myVote, setMyVote] = useOptimistic(poll.myOptionId)
  const [pending, startTransition] = useTransition()
  const showResults = myVote !== null || ended
  const total = poll.total + (myVote !== null && poll.myOptionId === null ? 1 : 0)

  function vote(optionId: string) {
    if (showResults || pending) return
    startTransition(async () => {
      setMyVote(optionId)
      const result = await votePoll(postId, optionId)
      if (!result.ok) toast.error(result.error)
    })
  }

  return (
    <div className="mt-3 flex flex-col gap-2" role="group" aria-label="Poll">
      {poll.options.map((option) => {
        const votes = option.votes + (myVote === option.id && poll.myOptionId === null ? 1 : 0)
        const percent = total > 0 ? Math.round((votes / total) * 100) : 0
        const chosen = myVote === option.id
        if (!showResults) {
          return (
            <button
              key={option.id}
              type="button"
              disabled={pending}
              onClick={() => vote(option.id)}
              className="relative z-10 h-11 rounded-xl border border-border px-4 text-left text-[15px] font-medium transition-colors hover:border-dusk hover:bg-dusk/5"
            >
              {option.label}
            </button>
          )
        }
        return (
          <div key={option.id} className="relative z-10 overflow-hidden rounded-xl border border-border">
            <motion.div
              className={cn("absolute inset-y-0 left-0", chosen ? "bg-dusk/25" : "bg-muted")}
              initial={{ width: 0 }}
              animate={{ width: `${percent}%` }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            />
            <div className="relative flex h-11 items-center justify-between gap-3 px-4 text-[15px]">
              <span className={cn("truncate", chosen && "font-semibold")}>
                {option.label}
                {chosen ? <span className="sr-only"> (your vote)</span> : null}
              </span>
              <span className="shrink-0 font-semibold tabular-nums">{percent}%</span>
            </div>
          </div>
        )
      })}
      <p className="text-[13px] text-muted-foreground">
        {total.toLocaleString("en-US")} {total === 1 ? "vote" : "votes"}
        {now > 0 ? ` · ${timeLeft(poll.endsAt, now)}` : ""}
      </p>
    </div>
  )
}
