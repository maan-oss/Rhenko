import { redirect } from "next/navigation"
import { getViewer } from "@/lib/auth"
import { firstParam } from "@/lib/params"
import { returnPathFrom } from "@/lib/invite-links"
import { AuthForm } from "@/components/app/auth-form"
import { AuthBack, AuthBar, AuthMark, AuthTitle } from "@/components/app/auth-frame"
import { AuthNotice } from "../auth-notice"
import { RevealSuspense } from "@/components/app/reveal-suspense"

type SearchParams = Promise<{ add?: string | string[]; notice?: string | string[]; next?: string | string[] }>

// Shown after something that sent the person back here, so they know what happened.
const NOTICES = new Map<string, string>([
  ["reset", "Your password is changed and every device was signed out. Log in with your new password."],
  ["deactivated", "Your account is deactivated and hidden. Log in again any time to reactivate it."],
  ["codes", "That sign-in stopped after 5 wrong codes. Log in again to get a new try."],
  ["expired", "Your sign-in timed out before the code was entered. Log in again."],
])

export default function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <RevealSuspense>
      <LoginBody searchParams={searchParams} />
    </RevealSuspense>
  )
}

// Signed-in people are sent home, except when they choose to add another account. Someone who opened a group invite link
// goes back to the invite once they are in.
async function LoginBody({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const adding = firstParam(params.add) !== undefined
  const back = returnPathFrom(firstParam(params.next))
  const notice = NOTICES.get(firstParam(params.notice) ?? "") ?? (back ? "Log in to open your group invite." : undefined)
  if (!adding && (await getViewer())) redirect(back ?? "/")
  return (
    <>
      {adding ? (
        <AuthBar left={<AuthBack href="/" label="Back to your account" />} />
      ) : (
        <AuthBar left={<AuthMark />} />
      )}
      <AuthTitle title={adding ? "Add an account" : "Welcome back"} />
      {notice ? (
        <div className="mt-6">
          <AuthNotice>{notice}</AuthNotice>
        </div>
      ) : null}
      <AuthForm mode="login" next={back} />
    </>
  )
}
