import { Suspense } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { getViewer } from "@/lib/auth"
import { LEGAL_UPDATED, TERMS_VERSION } from "@/lib/legal"
import { AcceptTermsForm, LogOutForm } from "@/components/app/accept-terms-form"

export const metadata: Metadata = {
  title: { absolute: "Review the updated terms · Rhenko" },
  robots: { index: false, follow: false },
}

// The app is closed to an account until it agrees to the current Terms and Privacy Policy. This screen is the only page
// that account can reach until then.
export default function AcceptTermsPage() {
  return (
    <Suspense fallback={null}>
      <AcceptTermsBody />
    </Suspense>
  )
}

async function AcceptTermsBody() {
  const viewer = await getViewer()
  if (!viewer) redirect("/login")
  if (viewer.termsVersion === TERMS_VERSION) redirect("/")
  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-[28px] font-semibold tracking-tight">Review the updated terms</h1>
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          We updated the Terms of Service and the Privacy Policy on {LEGAL_UPDATED}. Read them, then agree to keep using Rhenko.
        </p>
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          The{" "}
          <Link href="/terms" className="font-semibold text-foreground underline underline-offset-4">
            Terms of Service
          </Link>{" "}
          say what you can post and what happens when a rule is broken. The{" "}
          <Link href="/privacy" className="font-semibold text-foreground underline underline-offset-4">
            Privacy Policy
          </Link>{" "}
          says what we keep, why, and for how long.
        </p>
      </div>
      <AcceptTermsForm logoutButton={<LogOutForm />} />
    </>
  )
}
