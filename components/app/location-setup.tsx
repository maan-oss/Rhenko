"use client"

import { useState, useTransition, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { saveWhere } from "@/actions/connections"
import { saveAbout } from "@/actions/social"
import { WhereFields, type WhereValue } from "@/components/app/connection-fields"
import { OnboardingSteps, SETUP_GHOST, SETUP_INPUT, SETUP_PRIMARY, SETUP_STEPS } from "@/components/app/onboarding-steps"
import { MAX_LOCATION } from "@/lib/rules"

// The second setup screen: where someone is. The location is shown on the profile's About page, in any words. The city and
// region used for suggestions are private. Continue saves both and moves on to interests. Skip leaves setup open for later.

export type LocationStart = {
  location: string
  website: string
  where: WhereValue
}

export function LocationSetup({ initial }: { initial: LocationStart }) {
  const router = useRouter()
  const [location, setLocation] = useState(initial.location)
  const [where, setWhere] = useState(initial.where)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Saves the location and the suggestion place as one step. A refused value stays on screen with the reason.
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      const about = await saveAbout({ location, website: initial.website })
      if (!about.ok) return setError(about.error)
      const placed = await saveWhere(where)
      if (!placed.ok) return setError(placed.error)
      router.push("/welcome/interests")
    })
  }

  return (
    <div className="flex flex-col gap-8">
      <OnboardingSteps current={SETUP_STEPS.location} total={SETUP_STEPS.total} />

      <div className="flex flex-col gap-2">
        <h1 className="text-[30px] leading-tight font-semibold tracking-tight">Where you are</h1>
        <p className="text-[15px] leading-relaxed text-muted-foreground">Your location and the place you are in. You can change any of it later in Settings.</p>
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
            className={SETUP_INPUT}
          />
        </section>

        <section aria-labelledby="where-title" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 id="where-title" className="text-[15px] font-semibold">
              Where are you, for suggestions?
            </h2>
            <p className="text-[13px] text-muted-foreground">Your country, city or town, and region. It is only used to suggest people nearby, and never shown. Never your street.</p>
          </div>
          <WhereFields value={where} onChange={setWhere} />
        </section>

        {error ? (
          <p role="alert" className="settle rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-[14px] leading-snug text-destructive">
            {error}
          </p>
        ) : null}

        <div className="flex flex-col gap-2">
          <button type="submit" disabled={pending} className={SETUP_PRIMARY}>
            {pending ? "Saving…" : "Continue"}
          </button>
          <button type="button" onClick={() => router.push("/welcome")} disabled={pending} className={SETUP_GHOST}>
            Back
          </button>
          <button type="button" onClick={() => router.push("/")} disabled={pending} className={SETUP_GHOST}>
            Skip for now
          </button>
        </div>
      </form>
    </div>
  )
}
