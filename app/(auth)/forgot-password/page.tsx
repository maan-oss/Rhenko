import Link from "next/link"
import { connection } from "next/server"
import { emailReady } from "@/lib/settings-data"
import { ForgotPasswordForm } from "@/components/app/auth-form"
import { AuthNotice } from "../auth-notice"
import { RevealSuspense } from "@/components/app/reveal-suspense"

export default function ForgotPasswordPage() {
  return (
    <RevealSuspense>
      <ForgotBody />
    </RevealSuspense>
  )
}

async function ForgotBody() {
  // Whether email can go out is read when the page is requested, not when the app is built.
  await connection()
  const ready = emailReady()
  return (
    <>
      <div className="settle mb-5 flex flex-col gap-2">
        <h1 className="text-[30px] leading-tight font-semibold tracking-tight">Reset your password</h1>
        {ready ? <p className="text-[15px] leading-relaxed text-muted-foreground">We&apos;ll email a code to the account.</p> : null}
      </div>
      {ready ? (
        <ForgotPasswordForm />
      ) : (
        <div className="mb-4"><AuthNotice tone="warning">
          Email isn&apos;t set up on this server, so passwords can&apos;t be reset by email. Ask the person who runs this
          server for help.
        </AuthNotice></div>
      )}
      <p className="mt-5 text-center text-sm text-muted-foreground">
        Remembered it?{" "}
        <Link href="/login" className="font-semibold text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground">
          Log in
        </Link>
      </p>
    </>
  )
}
