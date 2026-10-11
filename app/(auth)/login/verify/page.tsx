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
      <div className="flex flex-col gap-2">
        <h1 className="text-[28px] font-semibold tracking-tight">Enter your code</h1>
        <p className="text-[15px] text-muted-foreground">
          Two-factor sign-in is on for @{user.handle}. Enter a code to finish logging in.
        </p>
      </div>
      {state.usable ? null : (
        <AuthNotice tone="warning">
          This server can&apos;t check codes from your authenticator app right now, so two-factor sign-in with the app is
          unavailable for this account. Enter one of your recovery codes instead.
          {state.recoveryLeft === 0
            ? " You have none left, so ask the person who runs this server to turn two-factor sign-in off for you."
            : ` You have ${state.recoveryLeft} left.`}
        </AuthNotice>
      )}
      <VerifyCodeForm usable={state.usable} />
      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-semibold text-foreground underline underline-offset-4">
          Use a different account
        </Link>
      </p>
    </>
  )
}
