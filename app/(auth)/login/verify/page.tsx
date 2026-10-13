import Link from "next/link"
import { redirect } from "next/navigation"
import { Suspense } from "react"
import { findUserById, readChallenge, secondFactorState } from "@/lib/auth"
import { VerifyCodeForm } from "@/components/app/auth-form"
import { AuthNotice } from "../../auth-notice"

export default function VerifyPage() {
  return (
    <Suspense fallback={null}>
      <VerifyBody />
    </Suspense>
  )
}

async function VerifyBody() {
  const challenge = await readChallenge()
  if (!challenge) redirect("/login")
  const user = findUserById(challenge.userId)
  const state = user ? secondFactorState(user.id) : null
  if (!user || !state?.enabled) redirect("/login")
  return (
    <>
      <div className="settle mb-8 flex flex-col gap-2">
        <h1 className="text-[30px] leading-tight font-semibold tracking-tight">Enter your code</h1>
        <p className="text-[15px] leading-relaxed text-muted-foreground">Two-factor is on for @{user.handle}.</p>
      </div>
      {state.usable ? null : (
        <div className="mb-6"><AuthNotice tone="warning">
          This server can&apos;t check codes from your authenticator app right now, so two-factor sign-in with the app is
          unavailable for this account. Enter one of your recovery codes instead.
          {state.recoveryLeft === 0
            ? " You have none left, so ask the person who runs this server to turn two-factor sign-in off for you."
            : ` You have ${state.recoveryLeft} left.`}
        </AuthNotice></div>
      )}
      <VerifyCodeForm usable={state.usable} />
      <p className="mt-8 text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-semibold text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground">
          Use a different account
        </Link>
      </p>
    </>
  )
}
