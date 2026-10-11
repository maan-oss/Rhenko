"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { verifySecondFactor, type AuthState } from "@/actions/auth"
import { Button } from "@/components/ui/button"

function Submit() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} className="h-11 rounded-lg text-[15px]">
      {pending ? "Checking" : "Continue"}
    </Button>
  )
}

// The second step of sign-in: a six-digit code, or one of the recovery codes (they contain a dash).
export function SecondFactorForm() {
  const [state, action] = useActionState(verifySecondFactor, {} as AuthState)
  return (
    <form action={action} className="flex w-full max-w-sm flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">Authentication code</span>
        <input
          name="code"
          required
          autoComplete="one-time-code"
          inputMode="text"
          placeholder="123456 or a recovery code"
          className="h-11 rounded-[4px] border border-input bg-background px-3 text-[15px] tracking-wider outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <span className="text-xs text-muted-foreground">Codes from your authenticator app change every 30 seconds.</span>
      </label>
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <Submit />
    </form>
  )
}
