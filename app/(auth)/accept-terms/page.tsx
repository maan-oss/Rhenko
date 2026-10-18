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
      <div className="settle mb-5 flex flex-col gap-2">
        <h1 className="text-[30px] leading-tight font-semibold tracking-tight">Updated terms</h1>
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          Changed on {LEGAL_UPDATED}. Read them, then agree to keep using Rhenko.
        </p>
      </div>
      <div className="settle mb-5 grid grid-cols-2 gap-3" style={{ animationDelay: "60ms" }}>
        <Link
          href="/terms"
          className="flex h-12 items-center justify-center rounded-full border border-border text-[15px] font-semibold transition-colors hover:border-foreground/30 hover:bg-foreground/5"
        >
          Terms
        </Link>
        <Link
          href="/privacy"
          className="flex h-12 items-center justify-center rounded-full border border-border text-[15px] font-semibold transition-colors hover:border-foreground/30 hover:bg-foreground/5"
        >
          Privacy Policy
        </Link>
      </div>
      <AcceptTermsForm logoutButton={<LogOutForm />} />
    </>
  )
}
