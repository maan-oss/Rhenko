"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ArrowLeft, Check } from "lucide-react"
import { finishSetup, saveLanguages, saveWhere, suggestedPeople } from "@/actions/connections"
import { setTopicFollow } from "@/actions/social"
import { ConnectionCard } from "@/components/app/connection-card"
import { LanguageFields, WhereFields, type LanguageValue, type WhereValue } from "@/components/app/connection-fields"
import type { SuggestedPerson } from "@/lib/connections"
import { cn } from "@/lib/utils"

// The four steps after sign-up. One question per screen. Each step saves what it changed before it moves on, and each
// can be skipped. Nothing in these steps is sent to anyone: a follow is the only thing that changes another account,
// and only when pressed.

const STEP_COUNT = 4

// Topics a new account can follow. Each is a plain hashtag, the same as one written in a post.
const TOPICS = [
  "music", "food", "travel", "books", "film", "sport", "art", "tech", "science", "nature",
  "photography", "gaming", "fitness", "business", "health", "news", "history", "languages", "parenting", "money",
]

type Initial = { where: WhereValue; languages: LanguageValue; topics: string[] }

const HEADINGS = [
  { title: "Where are you?", lead: "Your city or town. Never your street." },
  { title: "What do you speak?", lead: "To find people to practise with." },
  { title: "What are you into?", lead: "These fill your feed." },
  { title: "Meet people", lead: "Picked from what you shared." },
] as const

const STARTING_LEAD = "Nothing matches yet. Follow a few to fill your feed."

const PRIMARY =
  "flex h-12 w-full items-center justify-center rounded-full bg-foreground text-[15px] font-semibold text-background transition-opacity duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
const GHOST =
  "h-11 w-full rounded-full text-[15px] font-semibold text-muted-foreground transition-colors duration-200 hover:bg-foreground/5 hover:text-foreground disabled:opacity-50"

const EASE = [0.2, 0.7, 0.2, 1] as const

export function SetupFlow({ initial }: { initial: Initial }) {
  const router = useRouter()
  const reduce = useReducedMotion()
  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState(1)
  const [where, setWhere] = useState(initial.where)
  const [languages, setLanguages] = useState(initial.languages)
  const [topics, setTopics] = useState(() => new Set(initial.topics))
  const [people, setPeople] = useState<SuggestedPerson[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Moves to a step. The last step loads its people first, so it opens with them on screen.
  async function enter(next: number) {
    if (next === STEP_COUNT - 1) setPeople(await suggestedPeople())
    setDirection(next > step ? 1 : -1)
    setStep(next)
  }

  function back() {
    setError(null)
    setDirection(-1)
    setStep(step - 1)
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
  // Only the people to start with are on screen: say so, rather than say they match.
  const startingOnly = people.length > 0 && people.every((person) => person.group === "starting")
  const lead = step === STEP_COUNT - 1 && startingOnly ? STARTING_LEAD : heading.lead
  const slide = reduce ? 0 : 28

  return (
    <div className="flex flex-col gap-8">
      <div className="flex h-9 items-center gap-4">
        {step > 0 ? (
          <button
            type="button"
            onClick={back}
            disabled={pending}
            className="-ml-2 inline-flex h-9 items-center gap-1.5 rounded-full px-2.5 text-[14px] font-semibold text-muted-foreground transition-colors duration-200 hover:bg-foreground/5 hover:text-foreground disabled:opacity-50"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back
          </button>
        ) : null}
        <div role="progressbar" aria-label="Setup" aria-valuemin={1} aria-valuemax={STEP_COUNT} aria-valuenow={step + 1} className="ml-auto flex w-36 gap-1.5">
          {HEADINGS.map((_, index) => (
            <span key={index} className="relative h-1 flex-1 overflow-hidden rounded-full bg-border">
              <motion.span
                className="absolute inset-0 origin-left rounded-full bg-foreground"
                initial={false}
                animate={{ scaleX: index <= step ? 1 : 0 }}
                transition={{ duration: reduce ? 0 : 0.5, ease: EASE }}
              />
            </span>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false} custom={direction}>
        <motion.div
          key={step}
          custom={direction}
          initial={{ opacity: 0, x: direction * slide, filter: reduce ? "none" : "blur(6px)" }}
          animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, x: -direction * slide, filter: reduce ? "none" : "blur(6px)" }}
          transition={{ duration: reduce ? 0 : 0.34, ease: EASE }}
          className="flex flex-col gap-8"
        >
          <div className="flex flex-col gap-2">
            <h1 className="text-[30px] leading-tight font-semibold tracking-tight">{heading.title}</h1>
            <p className="text-[15px] leading-relaxed text-muted-foreground">{lead}</p>
          </div>

          {step === 0 ? <WhereFields value={where} onChange={setWhere} /> : null}
          {step === 1 ? <LanguageFields value={languages} onChange={setLanguages} /> : null}
          {step === 2 ? <TopicPicker chosen={topics} onToggle={toggleTopic} disabled={pending} /> : null}
          {step === 3 ? <PeopleStep people={people} /> : null}

          <div className="flex flex-col gap-2">
            {step < STEP_COUNT - 1 ? (
              <>
                <button type="button" onClick={continueStep} disabled={pending} className={PRIMARY}>
                  {pending ? "Saving…" : "Continue"}
                </button>
                <button type="button" onClick={skipStep} disabled={pending} className={GHOST}>
                  Skip for now
                </button>
              </>
            ) : (
              <button type="button" onClick={finish} disabled={pending} className={PRIMARY}>
                {pending ? "Opening…" : "Open Rhenko"}
              </button>
            )}
          </div>
        </motion.div>
      </AnimatePresence>

      {error ? (
        <p role="alert" className="settle rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-[14px] leading-snug text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

// A topic or language chip. Pressing it pops a little, and a chosen one fills in with a check.
function Chip({ on, onClick, disabled, children }: { on: boolean; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <motion.button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      whileTap={{ scale: 0.93 }}
      className={cn(
        "inline-flex h-11 items-center gap-2 rounded-full border px-4 text-[15px] font-medium transition-[background-color,border-color,color] duration-200 disabled:opacity-60",
        on ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground/30 hover:bg-foreground/5"
      )}
    >
      {on ? <Check className="size-4" strokeWidth={3} aria-hidden="true" /> : null}
      {children}
    </motion.button>
  )
}

function TopicPicker({ chosen, onToggle, disabled }: { chosen: Set<string>; onToggle: (tag: string) => void; disabled: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label="Topics" className="flex flex-wrap gap-2.5">
        {TOPICS.map((tag) => (
          <Chip key={tag} on={chosen.has(tag)} disabled={disabled} onClick={() => onToggle(tag)}>
            #{tag}
          </Chip>
        ))}
      </div>
      <p className="text-[13px] tabular-nums text-muted-foreground" aria-live="polite">
        {chosen.size === 0 ? "Pick as many as you like." : `${chosen.size} picked`}
      </p>
    </div>
  )
}

function PeopleStep({ people }: { people: SuggestedPerson[] }) {
  if (people.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card px-5 py-6">
        <p className="text-[15px] font-semibold">Nobody to show yet</p>
        <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">New people join every day. Look again in Connect.</p>
      </div>
    )
  }
  return (
    <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
      {people.map((person) => (
        <ConnectionCard key={person.id} person={person} compact />
      ))}
    </ul>
  )
}
