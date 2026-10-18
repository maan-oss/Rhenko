"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { resetDismissed, saveLanguages, saveWhere } from "@/actions/connections"
import { LanguageFields, WhereFields, type LanguageValue, type WhereValue } from "@/components/app/connection-fields"
import { Button } from "@/components/ui/button"

type Initial = { where: WhereValue; languages: LanguageValue }

// Settings for where someone is and what they speak. Each section saves on its own button, so an unsaved change in one
// does not hang on another.
export function ConnectionSettings({ initial, dismissed }: { initial: Initial; dismissed: number }) {
  return (
    <>
      <WhereSection initial={initial.where} />
      <LanguageSection initial={initial.languages} />
      <DismissedSection count={dismissed} />
    </>
  )
}

function WhereSection({ initial }: { initial: WhereValue }) {
  const [value, setValue] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  function save() {
    setError(null)
    startTransition(async () => {
      const result = await saveWhere(value)
      if (result.ok) toast.success("Saved where you are.")
      else setError(result.error)
    })
  }
  return (
    <section aria-labelledby="where-heading" className="flex flex-col gap-5 border-b border-border px-4 py-4">
      <div className="flex flex-col gap-1.5">
        <h2 id="where-heading" className="text-lg font-semibold">
          Where you are
        </h2>
        <p className="text-[14px] leading-relaxed text-muted-foreground">Used to suggest people nearby.</p>
      </div>
      <WhereFields value={value} onChange={setValue} />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button type="button" onClick={save} disabled={pending} className="h-10 rounded-lg px-5">
          {pending ? "Saving" : "Save where you are"}
        </Button>
      </div>
    </section>
  )
}

function LanguageSection({ initial }: { initial: LanguageValue }) {
  const [value, setValue] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  function save() {
    setError(null)
    startTransition(async () => {
      const result = await saveLanguages({ speak: value.speak, learn: value.learn, suggestLanguage: value.suggestLanguage })
      if (result.ok) toast.success("Saved your languages.")
      else setError(result.error)
    })
  }
  return (
    <section aria-labelledby="languages-heading" className="flex flex-col gap-5 border-b border-border px-4 py-4">
      <div className="flex flex-col gap-1.5">
        <h2 id="languages-heading" className="text-lg font-semibold">
          Languages
        </h2>
        <p className="text-[14px] leading-relaxed text-muted-foreground">
          Languages you speak show on your profile. Learning ones are only for finding partners.
        </p>
      </div>
      <LanguageFields value={value} onChange={setValue} />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button type="button" onClick={save} disabled={pending} className="h-10 rounded-lg px-5">
          {pending ? "Saving" : "Save languages"}
        </Button>
      </div>
    </section>
  )
}

// Shown only when someone has been set aside with "Not now". Showing them again brings them back at once.
function DismissedSection({ count }: { count: number }) {
  const [shown, setShown] = useState(count)
  const [pending, startTransition] = useTransition()
  if (shown === 0) return null
  return (
    <section aria-labelledby="dismissed-heading" className="flex items-start justify-between gap-4 px-4 py-4">
      <div className="flex flex-col gap-1">
        <h2 id="dismissed-heading" className="text-lg font-semibold">
          Not now
        </h2>
        <p className="text-[15px] text-muted-foreground">
          {`You have said not now to ${shown} ${shown === 1 ? "person" : "people"}.`}
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        className="h-9 shrink-0 rounded-lg px-4"
        onClick={() =>
          startTransition(async () => {
            const result = await resetDismissed()
            if (result.ok) {
              setShown(0)
              toast.success("They can be suggested again.")
            }
          })
        }
      >
        Show them again
      </Button>
    </section>
  )
}
