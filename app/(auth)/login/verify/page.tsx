import Link from "next/link"
import { redirect } from "next/navigation"
import { Suspense } from "react"
import { challengedUserId } from "@/lib/auth"
import { SecondFactorForm } from "@/components/app/second-factor-form"

export default function VerifyPage() {
  return (
    <Suspense fallback={null}>
      <VerifyBody />
    </Suspense>
  )
}

async function VerifyBody() {
  if (!(await challengedUserId())) redirect("/login")
  return (
    <>
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-xl font-semibold">Check your sign-in code</h1>
        <p className="max-w-sm text-sm text-muted-foreground">Enter the code from your authenticator app, or a recovery code.</p>
      </div>
      <SecondFactorForm />
      <p className="text-sm text-muted-foreground">
        <Link href="/login" className="font-semibold text-dusk underline underline-offset-4">
          Use a different account
        </Link>
      </p>
    </>
  )
}
