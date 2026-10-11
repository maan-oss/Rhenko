"use client"

import Link from "next/link"
import { useActionState, type ReactNode } from "react"
import { useFormStatus } from "react-dom"
import { acceptTerms, type LegalState } from "@/actions/legal"
import { logout } from "@/actions/auth"

// Shown when the current Terms or Privacy Policy have changed since this account last agreed. Until the box is ticked,
// the rest of the app stays closed.
export function AcceptTermsForm({ logoutButton }: { logoutButton?: ReactNode }) {
  const [state, formAction] = useActionState(acceptTerms, {} as LegalState)
  return (
    <div className="flex flex-col gap-6">
      <form action={formAction} className="flex flex-col gap-5">
        <label className="flex items-start gap-3 text-[14px] leading-relaxed">
          <input type="checkbox" name="agree" required className="mt-[3px] size-4 shrink-0 cursor-pointer accent-foreground" />
          <span>
            I have read and agree to the{" "}
            <Link href="/terms" target="_blank" className="font-semibold underline underline-offset-4">
              Terms of Service
            </Link>{" "}
            and the{" "}
            <Link href="/privacy" target="_blank" className="font-semibold underline underline-offset-4">
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
      className="h-12 w-full rounded-full bg-foreground text-[15px] font-semibold text-background transition-opacity hover:opacity-85 disabled:opacity-40"
    >
      {pending ? "Saving…" : "Agree and continue"}
    </button>
  )
}

// Signs the person out from this screen, for someone who does not agree and wants to leave.
export function LogOutForm() {
  return (
    <form action={logout}>
      <button
        type="submit"
        className="h-12 w-full rounded-full border border-border text-[15px] font-semibold transition-colors hover:bg-foreground/5"
      >
        Log out instead
      </button>
    </form>
  )
}
