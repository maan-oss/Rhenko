import Link from "next/link"
import { Suspense } from "react"
import { firstParam } from "@/lib/params"
import { MAX_EMAIL } from "@/lib/account-rules"
import { ResetPasswordForm } from "@/components/app/auth-form"

type SearchParams = Promise<{ email?: string | string[] }>

export default function ResetPasswordPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={null}>
      <ResetBody searchParams={searchParams} />
    </Suspense>
  )
}

async function ResetBody({ searchParams }: { searchParams: SearchParams }) {
  const email = (firstParam((await searchParams).email) ?? "").slice(0, MAX_EMAIL)
  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-[28px] font-semibold tracking-tight">Choose a new password</h1>
        <p className="text-[15px] text-muted-foreground">
          Enter the code we emailed you and a new password. Every device signed in to your account will be signed out.
        </p>
      </div>
      <ResetPasswordForm email={email} />
      <p className="text-center text-sm text-muted-foreground">
        No code?{" "}
        <Link href="/forgot-password" className="font-semibold text-foreground underline underline-offset-4">
          Send a new one
        </Link>
        {" · "}
        <Link href="/login" className="font-semibold text-foreground underline underline-offset-4">
          Log in
        </Link>
      </p>
    </>
  )
}
