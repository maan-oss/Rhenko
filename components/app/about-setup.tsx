"use client"

import { useState, useTransition, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { finishSetup, saveWhere } from "@/actions/connections"
import { saveAbout } from "@/actions/social"
import { WhereFields, type WhereValue } from "@/components/app/connection-fields"
import { OnboardingSteps, SETUP_STEPS } from "@/components/app/onboarding-steps"
import { TopicPicker } from "@/components/app/topic-picker"
import { MAX_LOCATION } from "@/lib/rules"

// The second setup screen: where someone is and what they are into. It sits apart from the profile on purpose. The location
// is shown on the profile's About page. The town used for suggestions is private, and so are interests. Open Rhenko saves
// everything and opens Home. Skip leaves setup open for later.

export type AboutStart = {
  location: string
  website: string
  where: WhereValue
  topics: string[]
}

const PRIMARY =
  "flex h-12 w-full items-center justify-center rounded-full bg-foreground text-[15px] font-semibold text-background transition-opacity duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
const GHOST =
  "h-11 w-full rounded-full text-[15px] font-semibold text-muted-foreground transition-colors duration-200 hover:bg-foreground/5 hover:text-foreground disabled:opacity-50"
const INPUT = "h-12 w-full rounded-xl border border-border bg-card px-4 text-[15px] outline-none transition-colors focus-visible:border-foreground/50"

export function AboutSetup({ initial }: { initial: AboutStart }) {
  const router = useRouter()
  const [location, setLocation] = useState(initial.location)
  const [where, setWhere] = useState(initial.where)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Saves the location, the suggestion town and the setup as one step. A refused value stays on screen with the reason.
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      const about = await saveAbout({ location, website: initial.website })
      if (!about.ok) return setError(about.error)
      const placed = await saveWhere(where)
      if (!placed.ok) return setError(placed.error)
      const finished = await finishSetup("done")
      if (!finished.ok) return setError(finished.error)
      router.push("/")
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-8">
      <OnboardingSteps current={SETUP_STEPS.about} total={SETUP_STEPS.total} />

      <div className="flex flex-col gap-2">
        <h1 className="text-[30px] leading-tight font-semibold tracking-tight">About you</h1>
        <p className="text-[15px] leading-relaxed text-muted-foreground">Where you are and what you&apos;re into. You can change any of it later in Settings.</p>
      </div>

      <form onSubmit={save} className="flex flex-col gap-8">
        <section aria-labelledby="location-title" className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 id="location-title" className="text-[15px] font-semibold">
              Location
            </h2>
            <p className="text-[13px] text-muted-foreground">Shown on your profile, in any words you like.</p>
          </div>
          <input
            aria-label="Location"
            name="location"
            maxLength={MAX_LOCATION}
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            placeholder="A city, a region, or nothing at all"
            className={INPUT}
          />
        </section>

        <section aria-labelledby="where-title" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 id="where-title" className="text-[15px] font-semibold">
              Where are you, for suggestions?
            </h2>
            <p className="text-[13px] text-muted-foreground">Your city or town. It is only used to suggest people nearby, and never shown. Never your street.</p>
          </div>
          <WhereFields value={where} onChange={setWhere} />
        </section>

        <TopicPicker initial={initial.topics} />

        {error ? (
          <p role="alert" className="settle rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-[14px] leading-snug text-destructive">
            {error}
          </p>
        ) : null}

        <div className="flex flex-col gap-2">
          <button type="submit" disabled={pending} className={PRIMARY}>
            {pending ? "Opening…" : "Open Rhenko"}
          </button>
          <button type="button" onClick={() => router.push("/welcome")} disabled={pending} className={GHOST}>
            Back
          </button>
          <button type="button" onClick={() => router.push("/")} disabled={pending} className={GHOST}>
            Skip for now
          </button>
        </div>
      </form>
    </div>
  )
}
