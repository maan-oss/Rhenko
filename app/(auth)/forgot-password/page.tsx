import { connection } from "next/server"
import { emailReady } from "@/lib/settings-data"
import { ForgotPasswordForm } from "@/components/app/auth-form"
import { AuthBack, AuthBar, AuthTitle } from "@/components/app/auth-frame"
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
      <AuthBar left={<AuthBack href="/login" label="Back to log in" />} />
      <AuthTitle title="Reset your password">{ready ? "We'll email a code to the account." : null}</AuthTitle>
      {ready ? (
        <ForgotPasswordForm />
      ) : (
        <div className="mt-6">
          <AuthNotice tone="warning">
            Email isn&apos;t set up on this server, so passwords can&apos;t be reset by email. Ask the person who runs this
            server for help.
          </AuthNotice>
        </div>
      )}
    </>
  )
}
