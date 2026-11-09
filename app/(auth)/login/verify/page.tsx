import { redirect } from "next/navigation"
import { findUserById, readChallenge, secondFactorState } from "@/lib/auth"
import { returnPathFrom, withReturnPath } from "@/lib/invite-links"
import { firstParam } from "@/lib/params"
import { passkeysOf } from "@/lib/passkeys"
import { VerifyCodeForm } from "@/components/app/auth-form"
import { AuthBack, AuthBar, AuthTitle, AuthTopLink } from "@/components/app/auth-frame"
import { AuthNotice } from "../../auth-notice"
import { RevealSuspense } from "@/components/app/reveal-suspense"

type SearchParams = Promise<{ next?: string | string[] }>

export default function VerifyPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <RevealSuspense>
      <VerifyBody searchParams={searchParams} />
    </RevealSuspense>
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
  const login = withReturnPath("/login", back)
  return (
    <>
      <AuthBar
        left={<AuthBack href={login} label="Back to log in" />}
        right={<AuthTopLink href={login}>Switch account</AuthTopLink>}
      />
      <AuthTitle title="Enter your code">Two-factor is on for @{user.handle}.</AuthTitle>
      {state.usable ? null : (
        <div className="mt-6">
          <AuthNotice tone="warning">
            This server can&apos;t check codes from your authenticator app right now, so two-factor sign-in with the app is
            unavailable for this account. Enter one of your recovery codes instead.
            {state.recoveryLeft === 0
              ? " You have none left, so ask the person who runs this server to turn two-factor sign-in off for you."
              : ` You have ${state.recoveryLeft} left.`}
          </AuthNotice>
        </div>
      )}
      <VerifyCodeForm usable={state.usable} hasKeys={(await passkeysOf(user.id)).length > 0} next={back} />
    </>
  )
}
