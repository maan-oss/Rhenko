import Link from "next/link"
import { connection } from "next/server"
import { Suspense } from "react"
import { emailReady } from "@/lib/settings-data"
import { ForgotPasswordForm } from "@/components/app/auth-form"
import { AuthNotice } from "../auth-notice"

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ForgotBody />
    </Suspense>
  )
}

async function ForgotBody() {
  // Whether email can go out is read when the page is requested, not when the app is built.
  await connection()
  const ready = emailReady()
  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-[28px] font-semibold tracking-tight">Reset your password</h1>
        <p className="text-[15px] text-muted-foreground">
          Enter your handle or email. If your account has a verified email, we&apos;ll send a 6-digit code to it.
        </p>
      </div>
      {ready ? (
        <ForgotPasswordForm />
      ) : (
        <AuthNotice tone="warning">
          Email isn&apos;t set up on this server, so passwords can&apos;t be reset by email. Ask the person who runs this
          server for help.
        </AuthNotice>
      )}
      <p className="text-center text-sm text-muted-foreground">
        Remembered it?{" "}
        <Link href="/login" className="font-semibold text-foreground underline underline-offset-4">
          Log in
        </Link>
      </p>
    </>
  )
}
