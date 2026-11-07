"use client"

import { useState, useTransition } from "react"
import { beginAgeCheck } from "@/actions/age"
import { ErrorLine } from "@/components/app/form-bits"
import { Button } from "@/components/ui/button"

// Starts the age check and opens Stripe's page for it in this window. Stripe sends the person back to Settings afterwards.
export function AgeCheckButton({ label }: { label: string }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        disabled={pending}
        onClick={() => {
          setPending(true)
          setError(null)
          startTransition(async () => {
            const result = await beginAgeCheck()
            if (!result.ok) {
              setError(result.error)
              setPending(false)
              return
            }
            if ("url" in result) {
              window.location.assign(result.url)
              return
            }
            window.location.reload()
          })
        }}
        className="self-start"
      >
        {pending ? "Opening the check..." : label}
      </Button>
      <ErrorLine message={error ?? undefined} />
    </div>
  )
}
