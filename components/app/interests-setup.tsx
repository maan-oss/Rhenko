"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { finishSetup } from "@/actions/connections"
import { OnboardingSteps, SETUP_GHOST, SETUP_PRIMARY, SETUP_STEPS } from "@/components/app/onboarding-steps"
import { TopicPicker } from "@/components/app/topic-picker"

// The last setup screen: what someone is into. Open Rhenko saves the setup as done and opens Home. Skip leaves setup open.

export function InterestsSetup({ initial }: { initial: string[] }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function open() {
    setError(null)
    startTransition(async () => {
      const finished = await finishSetup("done")
      if (!finished.ok) return setError(finished.error)
      router.push("/")
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-5">
      <OnboardingSteps current={SETUP_STEPS.interests} total={SETUP_STEPS.total} />

      <div className="flex flex-col gap-2">
        <h1 className="text-[30px] leading-tight font-semibold tracking-tight">What you&apos;re into</h1>
        <p className="text-[15px] leading-relaxed text-muted-foreground">Topics you follow show up in Explore and help suggest people. Pick as many as you like, or none.</p>
      </div>

      <TopicPicker initial={initial} />

      {error ? (
        <p role="alert" className="settle rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-[14px] leading-snug text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <button type="button" onClick={open} disabled={pending} className={SETUP_PRIMARY}>
          {pending ? "Opening…" : "Open Rhenko"}
        </button>
        <button type="button" onClick={() => router.push("/welcome/location")} disabled={pending} className={SETUP_GHOST}>
          Back
        </button>
        <button type="button" onClick={() => router.push("/")} disabled={pending} className={SETUP_GHOST}>
          Skip for now
        </button>
      </div>
    </div>
  )
}
