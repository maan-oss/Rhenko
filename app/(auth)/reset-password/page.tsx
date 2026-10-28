import Link from "next/link"
import { firstParam } from "@/lib/params"
import { MAX_EMAIL } from "@/lib/account-rules"
import { ResetPasswordForm } from "@/components/app/auth-form"
import { RevealSuspense } from "@/components/app/reveal-suspense"

type SearchParams = Promise<{ email?: string | string[] }>

export default function ResetPasswordPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <RevealSuspense>
      <ResetBody searchParams={searchParams} />
    </RevealSuspense>
  )
}

async function ResetBody({ searchParams }: { searchParams: SearchParams }) {
  const email = (firstParam((await searchParams).email) ?? "").slice(0, MAX_EMAIL)
  return (
    <>
      <div className="settle mb-5 flex flex-col gap-2">
        <h1 className="text-[30px] leading-tight font-semibold tracking-tight">New password</h1>
        <p className="text-[15px] leading-relaxed text-muted-foreground">Enter the code we emailed you.</p>
      </div>
      <ResetPasswordForm email={email} />
      <p className="mt-5 text-center text-sm text-muted-foreground">
        No code?{" "}
        <Link href="/forgot-password" className="font-semibold text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground">
          Send a new one
        </Link>
        {" · "}
        <Link href="/login" className="font-semibold text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground">
          Log in
        </Link>
      </p>
    </>
  )
}
