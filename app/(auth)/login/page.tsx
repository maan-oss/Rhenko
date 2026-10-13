import Link from "next/link"
import { redirect } from "next/navigation"
import { Suspense } from "react"
import { getViewer } from "@/lib/auth"
import { firstParam } from "@/lib/params"
import { AuthForm } from "@/components/app/auth-form"
import { AuthNotice } from "../auth-notice"

type SearchParams = Promise<{ add?: string | string[]; notice?: string | string[] }>

// Shown after something that sent the person back here, so they know what happened.
const NOTICES = new Map<string, string>([
  ["reset", "Your password is changed and every device was signed out. Log in with your new password."],
  ["deactivated", "Your account is deactivated and hidden. Log in again any time to reactivate it."],
  ["codes", "That sign-in stopped after 5 wrong codes. Log in again to get a new try."],
  ["expired", "Your sign-in timed out before the code was entered. Log in again."],
])

export default function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={null}>
      <LoginBody searchParams={searchParams} />
    </Suspense>
  )
}

// Signed-in people are sent home, except when they choose to add another account.
async function LoginBody({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const adding = firstParam(params.add) !== undefined
  const notice = NOTICES.get(firstParam(params.notice) ?? "")
  if (!adding && (await getViewer())) redirect("/")
  return (
    <>
      <div className="settle mb-8 flex flex-col gap-2">
        <h1 className="text-[30px] leading-tight font-semibold tracking-tight">{adding ? "Add an account" : "Welcome back"}</h1>
        <p className="text-[15px] leading-relaxed text-muted-foreground">Use your handle and password.</p>
      </div>
      {notice ? <div className="mb-6"><AuthNotice>{notice}</AuthNotice></div> : null}
      <AuthForm mode="login" />
      {adding ? (
        <p className="text-center text-sm text-muted-foreground">
          <Link href="/" className="font-semibold text-foreground underline underline-offset-4">
            Back to your account
          </Link>
        </p>
      ) : (
        <p className="mt-8 text-center text-sm text-muted-foreground">
          New here?{" "}
          <Link href="/signup" className="font-semibold text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground">
            Create an account
          </Link>
        </p>
      )}
    </>
  )
}
