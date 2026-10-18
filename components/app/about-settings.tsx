"use client"

import { useState, useTransition, type FormEvent } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { saveAbout } from "@/actions/social"
import { TopicPicker } from "@/components/app/topic-picker"
import { Button } from "@/components/ui/button"
import { MAX_LOCATION, MAX_WEBSITE } from "@/lib/rules"

type Initial = { location: string; website: string; topics: string[] }

const INPUT = "h-11 w-full rounded-xl border border-input bg-background px-3 text-[15px] outline-none focus-visible:border-foreground/50"

// About you in Settings. The location and website are saved with their own button. Interests save as each one is picked.
export function AboutSettings({ initial, handle }: { initial: Initial; handle: string }) {
  const [location, setLocation] = useState(initial.location)
  const [website, setWebsite] = useState(initial.website)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await saveAbout({ location, website })
      if (result.ok) toast.success("Saved your details.")
      else setError(result.error)
    })
  }

  return (
    <>
      <form onSubmit={save} className="flex flex-col gap-5 border-b border-border px-4 py-4">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-lg font-semibold">Details on your profile</h2>
          <p className="text-[14px] leading-relaxed text-muted-foreground">
            These show on your{" "}
            <Link href={`/${handle}/about`} className="font-semibold text-foreground underline underline-offset-4">
              About page
            </Link>
            , not on the profile itself.
          </p>
        </div>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Location
          <input
            name="location"
            maxLength={MAX_LOCATION}
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            placeholder="A city, a region, or nothing at all"
            className={INPUT}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Website
          <input
            name="website"
            type="url"
            maxLength={MAX_WEBSITE}
            placeholder="https://"
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
            className={INPUT}
          />
        </label>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end">
          <Button type="submit" disabled={pending} className="h-10 rounded-lg px-5">
            {pending ? "Saving" : "Save details"}
          </Button>
        </div>
      </form>
      <div className="border-b border-border px-4 py-4">
        <TopicPicker initial={initial.topics} />
        <p className="mt-3 text-[13px] text-muted-foreground">Interests are private. Only you see them.</p>
      </div>
    </>
  )
}
