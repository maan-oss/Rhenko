import Link from "next/link"
import { redirect } from "next/navigation"
import { Suspense } from "react"
import { findUserById, readChallenge, secondFactorState } from "@/lib/auth"
import { returnPathFrom, withReturnPath } from "@/lib/invite-links"
import { firstParam } from "@/lib/params"
import { passkeysOf } from "@/lib/passkeys"
import { VerifyCodeForm } from "@/components/app/auth-form"
import { AuthNotice } from "../../auth-notice"

type SearchParams = Promise<{ next?: string | string[] }>

export default function VerifyPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={null}>
      <VerifyBody searchParams={searchParams} />
    </Suspense>
  )
}

// A group invite opened before signing in is carried through this step, and opened once the code is in.
async function VerifyBody({ searchParams }: { searchParams: SearchParams }) {
  const back = returnPathFrom(firstParam((await searchParams).next))
  const challenge = await readChallenge()
  if (!challenge) redirect(withReturnPath("/login", back))
  const user = await findUserById(challenge.userId)
  const state = user ? await secondFactorState(user.id) : null
  if (!user || !state?.enabled) redirect(withReturnPath("/login", back))
  return (
    <>
      <div className="settle mb-5 flex flex-col gap-2">
        <h1 className="text-[30px] leading-tight font-semibold tracking-tight">Enter your code</h1>
        <p className="text-[15px] leading-relaxed text-muted-foreground">Two-factor is on for @{user.handle}.</p>
      </div>
      {state.usable ? null : (
        <div className="mb-4"><AuthNotice tone="warning">
          This server can&apos;t check codes from your authenticator app right now, so two-factor sign-in with the app is
          unavailable for this account. Enter one of your recovery codes instead.
          {state.recoveryLeft === 0
            ? " You have none left, so ask the person who runs this server to turn two-factor sign-in off for you."
            : ` You have ${state.recoveryLeft} left.`}
        </AuthNotice></div>
      )}
      <VerifyCodeForm usable={state.usable} hasKeys={(await passkeysOf(user.id)).length > 0} next={back} />
      <p className="mt-5 text-center text-sm text-muted-foreground">
        <Link href={withReturnPath("/login", back)} className="font-semibold text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground">
          Use a different account
        </Link>
      </p>
    </>
  )
}
