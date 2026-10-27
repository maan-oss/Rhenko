"use client"

import { useOptimistic, useTransition } from "react"
import { motion } from "motion/react"
import { Check } from "lucide-react"
import { toast } from "sonner"
import { voteInChatPoll } from "@/actions/messages"
import type { ChatPoll } from "@/lib/data"
import { cn } from "@/lib/utils"

// A poll sent in a chat. Anyone in the chat taps a choice to vote. A single-answer poll moves the vote to the choice tapped,
// and a multiple-answer poll toggles each choice. Once someone has voted, every choice shows its share. Only the counts are
// shown, never who chose what.
export function ChatPollView({ messageId, poll }: { messageId: string; poll: ChatPoll }) {
  const [mine, setMine] = useOptimistic(poll.mine)
  const [, startTransition] = useTransition()
  const voted = mine.length > 0
  // The server's counts include this viewer's own vote, so the picture moves with a tap before the server answers.
  const shift = (option: string) => (poll.mine.includes(option) ? -1 : 0) + (mine.includes(option) ? 1 : 0)
  const voters = poll.voters + (voted ? 1 : 0) - (poll.mine.length > 0 ? 1 : 0)
  const choices = poll.options.map((option) => ({ ...option, votes: option.votes + shift(option.id) }))

  function choose(optionId: string) {
    const next = poll.multiple
      ? mine.includes(optionId)
        ? mine.filter((id) => id !== optionId)
        : [...mine, optionId]
      : mine.includes(optionId)
        ? mine
        : [optionId]
    if (next === mine) return
    startTransition(async () => {
      setMine(next)
      const result = await voteInChatPoll(messageId, next)
      if (!result.ok) toast.error(result.error)
    })
  }

  return (
    <div role={poll.multiple ? "group" : "radiogroup"} aria-label={poll.question} className="flex w-72 max-w-full flex-col gap-1.5">
      <p className="font-semibold leading-snug [overflow-wrap:anywhere]">{poll.question}</p>
      {choices.map((option) => {
        const chosen = mine.includes(option.id)
        const percent = voters > 0 ? Math.round((option.votes / voters) * 100) : 0
        return (
          <button
            key={option.id}
            type="button"
            role={poll.multiple ? "checkbox" : "radio"}
            aria-checked={chosen}
            onClick={() => choose(option.id)}
            className="relative flex min-h-11 w-full min-w-0 items-center gap-2.5 overflow-hidden rounded-xl border border-border bg-background px-3 py-2 text-left text-[15px] text-foreground outline-none transition-colors duration-200 hover:border-foreground/40 focus-visible:ring-2 focus-visible:ring-ring"
          >
            {voted ? (
              <motion.span
                aria-hidden="true"
                className={cn("absolute inset-y-0 left-0", chosen ? "bg-dusk/25" : "bg-foreground/10")}
                initial={false}
                animate={{ width: `${percent}%` }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              />
            ) : null}
            <span
              aria-hidden="true"
              className={cn(
                "relative grid size-5 shrink-0 place-items-center border-[1.5px] border-foreground/45",
                poll.multiple ? "rounded-md" : "rounded-full",
                chosen && "border-foreground bg-foreground text-background"
              )}
            >
              {chosen ? <Check className="size-3.5" strokeWidth={3} /> : null}
            </span>
            <span className={cn("relative min-w-0 flex-1 [overflow-wrap:anywhere]", chosen && "font-semibold")}>{option.label}</span>
            {voted ? <span className="relative shrink-0 text-[13px] font-semibold tabular-nums">{percent}%</span> : null}
          </button>
        )
      })}
      <p className="text-[13px] opacity-70">
        {voted
          ? `${voters.toLocaleString("en-US")} ${voters === 1 ? "vote" : "votes"}${poll.multiple ? " · choose one or more" : ""}`
          : poll.multiple
            ? "Choose one or more"
            : "Choose one"}
      </p>
    </div>
  )
}
