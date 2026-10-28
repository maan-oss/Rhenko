"use client"

import { useId, useState, useTransition, type ReactNode } from "react"
import { Check } from "lucide-react"
import { setTopicFollow } from "@/actions/social"
import { cn } from "@/lib/utils"

// Topics a person can follow as an interest. Each is a plain hashtag, the same as one written in a post.
export const INTEREST_TOPICS = [
  "music", "food", "travel", "books", "film", "sport", "art", "tech", "science", "nature",
  "photography", "gaming", "fitness", "business", "health", "news", "history", "languages", "parenting", "money",
]

// The interests picker: a set of chips. Each chip saves as it is picked, the same as following a topic anywhere in the app.
// A refused one goes back the way it was, with the reason shown under the chips.
export function TopicPicker({ initial, className }: { initial: string[]; className?: string }) {
  const titleId = useId()
  const [topics, setTopics] = useState(() => new Set(initial))
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function toggle(tag: string) {
    const following = topics.has(tag)
    setError(null)
    setTopics((current) => {
      const next = new Set(current)
      if (following) next.delete(tag)
      else next.add(tag)
      return next
    })
    startTransition(async () => {
      const result = await setTopicFollow(tag, !following)
      if (!result.ok) {
        setError(result.error)
        setTopics((current) => {
          const next = new Set(current)
          if (following) next.add(tag)
          else next.delete(tag)
          return next
        })
      }
    })
  }

  return (
    <section aria-labelledby={titleId} className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-col gap-1">
        <h2 id={titleId} className="text-[15px] font-semibold">
          Interests
        </h2>
        <p className="text-[13px] text-muted-foreground" aria-live="polite">
          {topics.size === 0 ? "These fill your feed. Pick as many as you like." : `${topics.size} picked. These fill your feed.`}
        </p>
      </div>
      <div role="group" aria-labelledby={titleId} className="flex flex-wrap gap-2">
        {INTEREST_TOPICS.map((tag) => (
          <Chip key={tag} on={topics.has(tag)} disabled={pending} onClick={() => toggle(tag)}>
            #{tag}
          </Chip>
        ))}
      </div>
      {error ? (
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  )
}

// A topic chip. A chosen one fills in with a check.
function Chip({ on, onClick, disabled, children }: { on: boolean; onClick: () => void; disabled: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "tap-44 inline-flex h-9 max-sm:h-11 items-center gap-1.5 rounded-full border px-3.5 text-[14px] font-medium transition-[background-color,border-color,color,transform] duration-200 active:bg-foreground/10 disabled:opacity-60",
        on ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground/30 hover:bg-foreground/5"
      )}
    >
      {on ? <Check className="size-3.5" strokeWidth={3} aria-hidden="true" /> : null}
      {children}
    </button>
  )
}
