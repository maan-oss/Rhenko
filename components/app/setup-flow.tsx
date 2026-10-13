"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { finishSetup, saveLanguages, saveWhere, suggestedPeople } from "@/actions/connections"
import { setTopicFollow } from "@/actions/social"
import { ConnectionCard } from "@/components/app/connection-card"
import { LanguageFields, WhereFields, type LanguageValue, type WhereValue } from "@/components/app/connection-fields"
import type { SuggestedPerson } from "@/lib/connections"
import { cn } from "@/lib/utils"

// The four steps after sign-up. Each step saves what it changed before it moves on, and each can be skipped. Nothing in
// these steps is sent to anyone: a follow is the only thing that changes another account, and only when pressed.

const STEP_COUNT = 4

// Topics a new account can follow. Each is a plain hashtag, the same as one written in a post.
const TOPICS = [
  "music", "food", "travel", "books", "film", "sport", "art", "tech", "science", "nature",
  "photography", "gaming", "fitness", "business", "health", "news", "history", "languages", "parenting", "money",
]

type Initial = { where: WhereValue; languages: LanguageValue; topics: string[] }

const HEADINGS = [
  {
    title: "Where are you based?",
    lead: "This helps us find people near you. Only you see it, and you can change it at any time.",
  },
  {
    title: "What languages do you speak?",
    lead: "Add the ones you can talk in, and any you are learning. We use them to find people to practise with.",
  },
  {
    title: "What are you into?",
    lead: "Follow a few topics. Posts on them fill your feed, and you will meet people who write about them.",
  },
  {
    title: "Meet people",
    lead: "These people match what you shared. Follow the ones you want. Each card says why they are here.",
  },
] as const

const PRIMARY =
  "flex h-12 w-full items-center justify-center rounded-full bg-foreground text-[15px] font-semibold text-background transition-opacity hover:opacity-85 disabled:opacity-40"

export function SetupFlow({ initial }: { initial: Initial }) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [where, setWhere] = useState(initial.where)
  const [languages, setLanguages] = useState(initial.languages)
  const [topics, setTopics] = useState(() => new Set(initial.topics))
  const [people, setPeople] = useState<SuggestedPerson[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Moves to a step. The last step loads its people first, so it opens with them on screen.
  async function enter(next: number) {
    if (next === STEP_COUNT - 1) setPeople(await suggestedPeople())
    setStep(next)
  }

  // Saves the step on screen, then moves on.
  function continueStep() {
    setError(null)
    startTransition(async () => {
      if (step === 0) {
        const result = await saveWhere(where)
        if (!result.ok) return setError(result.error)
      }
      if (step === 1) {
        const result = await saveLanguages({ speak: languages.speak, learn: languages.learn, suggestLanguage: languages.suggestLanguage })
        if (!result.ok) return setError(result.error)
      }
      await enter(step + 1)
    })
  }

  // Leaves a step without saving it. The values stay as they were, so nothing is lost by coming back.
  function skipStep() {
    setError(null)
    startTransition(async () => {
      await enter(step + 1)
    })
  }

  function finish() {
    setError(null)
    startTransition(async () => {
      const result = await finishSetup("done")
      if (!result.ok) return setError(result.error)
      router.push("/")
      router.refresh()
    })
  }

  // Topics save as they are picked, so a follow is never lost when the page moves on.
  function toggleTopic(tag: string) {
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

  const heading = HEADINGS[step]

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between text-[13px] text-muted-foreground">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => {
                setError(null)
                setStep(step - 1)
              }}
              disabled={pending}
              className="font-semibold text-foreground underline-offset-4 hover:underline disabled:opacity-50"
            >
              Back
            </button>
          ) : (
            <span />
          )}
          <span>
            Step {step + 1} of {STEP_COUNT}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-1.5" aria-hidden="true">
          {HEADINGS.map((_, index) => (
            <span key={index} className={cn("h-1 rounded-full transition-colors duration-300", index <= step ? "bg-foreground" : "bg-border")} />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h1 className="text-[28px] font-semibold tracking-tight">{heading.title}</h1>
        <p className="text-[15px] leading-relaxed text-muted-foreground">{heading.lead}</p>
      </div>

      {step === 0 ? <WhereFields value={where} onChange={setWhere} /> : null}
      {step === 1 ? <LanguageFields value={languages} onChange={setLanguages} /> : null}
      {step === 2 ? <TopicPicker chosen={topics} onToggle={toggleTopic} disabled={pending} /> : null}
      {step === 3 ? <PeopleStep people={people} /> : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        {step < STEP_COUNT - 1 ? (
          <>
            <button type="button" onClick={continueStep} disabled={pending} className={PRIMARY}>
              {pending ? "Saving" : "Continue"}
            </button>
            <button
              type="button"
              onClick={skipStep}
              disabled={pending}
              className="h-10 w-full rounded-full text-[15px] font-semibold text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground disabled:opacity-50"
            >
              Skip for now
            </button>
          </>
        ) : (
          <button type="button" onClick={finish} disabled={pending} className={PRIMARY}>
            {pending ? "Finishing" : "Finish"}
          </button>
        )}
      </div>
    </div>
  )
}

function TopicPicker({ chosen, onToggle, disabled }: { chosen: Set<string>; onToggle: (tag: string) => void; disabled: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="Topics" className="flex flex-wrap gap-2">
        {TOPICS.map((tag) => {
          const on = chosen.has(tag)
          return (
            <button
              key={tag}
              type="button"
              aria-pressed={on}
              disabled={disabled}
              onClick={() => onToggle(tag)}
              className={cn(
                "inline-flex h-10 items-center rounded-full border px-4 text-[15px] font-medium transition-colors duration-200 disabled:opacity-60",
                on ? "border-foreground bg-foreground text-background" : "border-border hover:bg-foreground/5"
              )}
            >
              #{tag}
            </button>
          )
        })}
      </div>
      <p className="text-[13px] text-muted-foreground">
        {chosen.size === 0 ? "Nothing chosen yet." : `${chosen.size} ${chosen.size === 1 ? "topic" : "topics"} chosen.`}
      </p>
    </div>
  )
}

function PeopleStep({ people }: { people: SuggestedPerson[] }) {
  if (people.length === 0) {
    return (
      <div className="flex flex-col gap-2 rounded-2xl border border-border px-5 py-6">
        <p className="text-[15px] font-semibold">Nobody matches yet</p>
        <p className="text-[14px] leading-relaxed text-muted-foreground">
          People show up here as they join, and as they post about the topics you follow. You can look again in Connect at any time.
        </p>
      </div>
    )
  }
  return (
    <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border">
      {people.map((person) => (
        <ConnectionCard key={person.id} person={person} />
      ))}
    </ul>
  )
}
