"use client"

import Link from "next/link"
import { useActionState, type ReactNode } from "react"
import { useFormStatus } from "react-dom"
import { acceptTerms, type LegalState } from "@/actions/legal"
import { SignOutForm } from "@/components/app/sign-out-form"

// Shown when the current Terms or Privacy Policy have changed since this account last agreed. Until the box is ticked,
// the rest of the app stays closed.
export function AcceptTermsForm({ logoutButton }: { logoutButton?: ReactNode }) {
  const [state, formAction] = useActionState(acceptTerms, {} as LegalState)
  return (
    <div className="settle flex flex-col gap-4" style={{ animationDelay: "120ms" }}>
      <form action={formAction} className="flex flex-col gap-4">
        <label className="flex cursor-pointer items-start gap-3 text-[14px] leading-relaxed">
          <input type="checkbox" name="agree" required className="mt-[3px] size-4 shrink-0 cursor-pointer accent-dusk" />
          <span>
            I agree to the{" "}
            <Link href="/terms" target="_blank" className="font-semibold underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground">
              Terms
            </Link>{" "}
            and the{" "}
            <Link href="/privacy" target="_blank" className="font-semibold underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground">
              Privacy Policy
            </Link>
            .
          </span>
        </label>
        {state.error ? (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        ) : null}
        <Submit />
      </form>
      {logoutButton}
    </div>
  )
}

function Submit() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-12 w-full rounded-full bg-foreground text-[15px] font-semibold text-background transition-opacity duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Saving…" : "Agree and continue"}
    </button>
  )
}

// Signs the person out from this screen, for someone who does not agree and wants to leave.
export function LogOutForm() {
  return (
    <SignOutForm>
      <button
        type="submit"
        className="h-12 w-full rounded-full border border-border text-[15px] font-semibold transition-colors hover:border-foreground/30 hover:bg-foreground/5"
      >
        Log out instead
      </button>
    </SignOutForm>
  )
}
